const express = require('express');
const router = express.Router();
const pool = require('./db');
const bcrypt = require('bcrypt');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { verificarToken, soloAdmin } = require('./auth');
const fs = require('fs');

// Todas las rutas de admin requieren token y rol admin
router.use(verificarToken);
router.use(soloAdmin);

// Funcion para generar contraseña aleatoria
const generarPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// POST /api/admin/usuarios - Crear usuario
router.post('/usuarios', async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username obligatorio' });
  }

  try {
    const passwordPlana = generarPassword();
    const passwordHash = await bcrypt.hash(passwordPlana, 10);

    const result = await pool.query(
      `INSERT INTO usuarios (username, password, rol)
       VALUES ($1, $2, 'usuario') RETURNING id, username, rol, fecha_alta`,
      [username, passwordHash]
    );

    // Crear cliente asociado al usuario
    await pool.query(
      `INSERT INTO clientes (usuario_id, nombre)
       VALUES ($1, $2)`,
      [result.rows[0].id, username]
    );

    res.status(201).json({
      usuario: result.rows[0],
      password: passwordPlana
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/usuarios - Listar todos los usuarios
router.get('/usuarios', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.rol, u.activo, u.fecha_alta,
              COUNT(cr.id) as num_dispositivos
       FROM usuarios u
       LEFT JOIN clientes c ON c.usuario_id = u.id
       LEFT JOIN credenciales cr ON cr.cliente_id = c.id AND cr.estado = 'activa'
       GROUP BY u.id
       ORDER BY u.fecha_alta DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/usuarios/:id/desactivar', async (req, res) => {
  const { id } = req.params;
  try {
    // Obtener todos los dispositivos activos del usuario
    const credenciales = await pool.query(
      `SELECT cr.public_key FROM credenciales cr
       JOIN clientes c ON c.id = cr.cliente_id
       WHERE c.usuario_id = $1 AND cr.estado = 'activa'`,
      [id]
    );

    // Eliminar cada peer de WireGuard
    for (const cred of credenciales.rows) {
      await execPromise(
        `docker exec mi-wireguard wg set wg0 peer ${cred.public_key} remove`
      );
      await execPromise(
        'docker exec mi-wireguard wg-quick save wg0'
      );
    }

    // Pausar todos los dispositivos activos en la DB
    await pool.query(
      `UPDATE credenciales SET estado = 'pausada', ip_asignada = '0.0.0.0'
       WHERE cliente_id IN (
         SELECT id FROM clientes WHERE usuario_id = $1
       ) AND estado = 'activa'`,
      [id]
    );

    // Desactivar usuario
    await pool.query(
      'UPDATE usuarios SET activo = false WHERE id = $1',
      [id]
    );

    // Guardar log
    await pool.query(
      'INSERT INTO logs (usuario_id, accion) VALUES ($1, $2)',
      [id, 'usuario_desactivado']
    );

    res.json({ mensaje: 'Usuario desactivado y dispositivos pausados' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/dispositivos - Ver todos los dispositivos de todos los usuarios
router.get('/dispositivos', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT cr.*, c.nombre, u.username
       FROM credenciales cr
       JOIN clientes c ON c.id = cr.cliente_id
       JOIN usuarios u ON u.id = c.usuario_id
       WHERE cr.estado != 'revocada'
       ORDER BY cr.fecha_emision DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/dispositivos/:id/toggle - Apagar/encender dispositivo
router.put('/dispositivos/:id/toggle', async (req, res) => {
  const { id } = req.params;
  try {
    const cred = await pool.query(
      'SELECT * FROM credenciales WHERE id = $1',
      [id]
    );
    if (cred.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const dispositivo = cred.rows[0];

    if (dispositivo.estado === 'activa') {
      // Pausar: eliminar peer de WireGuard y liberar IP
      await execPromise(
        `docker exec mi-wireguard wg set wg0 peer ${dispositivo.public_key} remove`
      );
      await pool.query(
        'UPDATE credenciales SET estado = $1, ip_asignada = $2 WHERE id = $3',
        ['pausada', '0.0.0.0', id]
      );
      await execPromise(
        'docker exec mi-wireguard wg-quick save wg0'
      );
      res.json({ mensaje: 'Dispositivo pausado' });

    } else if (dispositivo.estado === 'pausada') {
      // Reactivar: calcular nueva IP y añadir peer
      const result = await pool.query(
        `SELECT ip_asignada FROM credenciales 
         WHERE ip_asignada != '0.0.0.0' AND estado = 'activa'
         ORDER BY ip_asignada`
      );
      let esperada = 2;
      for (const row of result.rows) {
        const ultimo = parseInt(row.ip_asignada.split('.')[3]);
        if (ultimo !== esperada) break;
        esperada++;
      }
      const nuevaIP = `10.0.0.${esperada}`;

      await execPromise(
        `docker exec mi-wireguard wg set wg0 peer ${dispositivo.public_key} allowed-ips ${nuevaIP}/32`
      );
      await pool.query(
        'UPDATE credenciales SET estado = $1, ip_asignada = $2 WHERE id = $3',
        ['activa', nuevaIP, id]
      );
      await execPromise(
        'docker exec mi-wireguard wg-quick save wg0'
      );
      res.json({ mensaje: 'Dispositivo activado', ip: nuevaIP });

    } else {
      return res.status(400).json({ error: 'El dispositivo esta revocado y no se puede reactivar' });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/usuarios/:id/activar', async (req, res) => {
  const { id } = req.params;
  try {
    // Obtener todos los dispositivos pausados del usuario
    const credenciales = await pool.query(
      `SELECT cr.* FROM credenciales cr
       JOIN clientes c ON c.id = cr.cliente_id
       WHERE c.usuario_id = $1 AND cr.estado = 'pausada'`,
      [id]
    );

    // Reactivar cada dispositivo con nueva IP
    for (const cred of credenciales.rows) {
      const result = await pool.query(
        `SELECT ip_asignada FROM credenciales 
         WHERE ip_asignada != '0.0.0.0' AND estado = 'activa'
         ORDER BY ip_asignada`
      );
      let esperada = 2;
      for (const row of result.rows) {
        const ultimo = parseInt(row.ip_asignada.split('.')[3]);
        if (ultimo !== esperada) break;
        esperada++;
      }
      const nuevaIP = `10.0.0.${esperada}`;

      await execPromise(
        `docker exec mi-wireguard wg set wg0 peer ${cred.public_key} allowed-ips ${nuevaIP}/32`
      );

      await execPromise(
        'docker exec mi-wireguard wg-quick save wg0'
      );

      await pool.query(
        'UPDATE credenciales SET estado = $1, ip_asignada = $2 WHERE id = $3',
        ['activa', nuevaIP, cred.id]
      );
    }

    // Activar usuario
    await pool.query(
      'UPDATE usuarios SET activo = true WHERE id = $1',
      [id]
    );

    await pool.query(
      'INSERT INTO logs (usuario_id, accion) VALUES ($1, $2)',
      [id, 'usuario_activado']
    );

    res.json({ mensaje: 'Usuario activado y dispositivos reactivados correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/usuarios/:id - Eliminar usuario completamente
router.delete('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Revocar todos los dispositivos activos de WireGuard
    const credenciales = await pool.query(
      `SELECT cr.public_key FROM credenciales cr
       JOIN clientes c ON c.id = cr.cliente_id
       WHERE c.usuario_id = $1 AND cr.estado IN ('activa', 'pausada')`,
      [id]
    );

    for (const cred of credenciales.rows) {
      try {
        await execPromise(
          `docker exec mi-wireguard wg set wg0 peer ${cred.public_key} remove`
        );
	await execPromise(
	  'docker exec mi-wireguard wg-quick save wg0'
	);
      } catch (e) {}
    }

    // Borrar en orden por las foreign keys
    await pool.query(
      `DELETE FROM credenciales WHERE cliente_id IN (
        SELECT id FROM clientes WHERE usuario_id = $1
      )`, [id]
    );
    await pool.query('DELETE FROM clientes WHERE usuario_id = $1', [id]);
    await pool.query('DELETE FROM logs WHERE usuario_id = $1', [id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);

    res.json({ mensaje: 'Usuario eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// DELETE /api/admin/dispositivos/:id - Eliminar dispositivo
router.delete('/dispositivos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const cred = await pool.query(
      'SELECT * FROM credenciales WHERE id = $1',
      [id]
    );
    if (cred.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const dispositivo = cred.rows[0];

    // Eliminar peer de WireGuard si esta activo o pausado
    if (dispositivo.estado === 'activa' || dispositivo.estado === 'pausada') {
      try {
        await execPromise(
          `docker exec mi-wireguard wg set wg0 peer ${dispositivo.public_key} remove`
        );
	await execPromise(
	  'docker exec mi-wireguard wg-quick save wg0'
	);
      } catch (e) {}
    }

    // Actualizar estado en la DB
    await pool.query(
      `UPDATE credenciales SET estado = 'revocada', ip_asignada = '0.0.0.0'
       WHERE id = $1`,
      [id]
    );

    // Obtener usuario_id para el log
    const usuarioResult = await pool.query(
      `SELECT u.id as usuario_id FROM usuarios u
       JOIN clientes c ON c.usuario_id = u.id
       WHERE c.id = $1`,
      [dispositivo.cliente_id]
    );
    const usuarioId = usuarioResult.rows[0]?.usuario_id;

    // Guardar log
    await pool.query(
      'INSERT INTO logs (usuario_id, accion, detalle) VALUES ($1, $2, $3)',
      [usuarioId, 'dispositivo_eliminado_admin', `ID dispositivo: ${id}`]
    );


    res.json({ mensaje: 'Dispositivo eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// PUT /api/admin/modo - Cambiar modo web abierto/cerrado
router.put('/modo', async (req, res) => {
  const { modo } = req.body;
  if (modo !== 'abierto' && modo !== 'cerrado') {
    return res.status(400).json({ error: 'Modo invalido, usa abierto o cerrado' });
  }

  try {
    const dominio = process.env.SERVER_ENDPOINT.split(':')[0];

    const nginxAbierto = `server {
    listen 80;
    server_name ${dominio};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name ${dominio};

    ssl_certificate /etc/letsencrypt/live/${dominio}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${dominio}/privkey.pem;

    location / {
        proxy_pass http://mi-backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}`;

// Obtener IP publica actual
const { stdout: ipPublica } = await execPromise('curl -s ifconfig.me');
const ip = ipPublica.trim();

    const nginxCerrado = `server {
    listen 80;
    server_name ${dominio};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name ${dominio};

    ssl_certificate /etc/letsencrypt/live/${dominio}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${dominio}/privkey.pem;

    allow 192.168.0.0/24;
    allow 10.0.0.0/24;
    allow ${ip};
    deny all;

    location / {
        proxy_pass http://mi-backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}`;

    const config = modo === 'abierto' ? nginxAbierto : nginxCerrado;
    fs.writeFileSync('/etc/nginx-config/nginx.conf', config);

    await execPromise('docker restart mi-nginx');

    await pool.query(
      'UPDATE configuracion SET valor = $1 WHERE clave = $2',
      [modo, 'modo_web']
    );

    res.json({ mensaje: `Modo web cambiado a ${modo}` });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/modo - Ver modo actual
router.get('/modo', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT valor FROM configuracion WHERE clave = $1',
      ['modo_web']
    );
    res.json({ modo: result.rows[0].valor });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// GET /api/admin/trafico - Ver trafico de todos los peers
router.get('/trafico', async (req, res) => {
  try {
    const { stdout } = await execPromise('docker exec mi-wireguard wg show wg0 dump');
    const lineas = stdout.trim().split('\n').slice(1); // saltar la primera linea del servidor

    const peers = lineas.map(linea => {
      const partes = linea.split('\t');
      const publicKey = partes[0];
      const endpoint = partes[2];
      const allowedIps = partes[3];
      const lastHandshake = parseInt(partes[4]);
      const rxBytes = parseInt(partes[5]);
      const txBytes = parseInt(partes[6]);

      const ahora = Math.floor(Date.now() / 1000);
      const segundos = ahora - lastHandshake;
      const conectado = lastHandshake > 0 && segundos < 180;

      return {
        public_key: publicKey,
        endpoint: endpoint === '(none)' ? null : endpoint,
        allowed_ips: allowedIps,
        last_handshake: lastHandshake,
        rx_bytes: rxBytes,
        tx_bytes: txBytes,
        conectado
      };
    });

    // Enriquecer con datos de la DB
    const result = await pool.query(
      `SELECT cr.public_key, cr.nombre_dispositivo, cr.ip_asignada,
              u.username
       FROM credenciales cr
       JOIN clientes c ON c.id = cr.cliente_id
       JOIN usuarios u ON u.id = c.usuario_id
       WHERE cr.estado = 'activa'`
    );

    const dispositivos = result.rows;
    const peersEnriquecidos = peers.map(peer => {
      const dispositivo = dispositivos.find(d => d.public_key === peer.public_key);
      return {
        ...peer,
        nombre_dispositivo: dispositivo ? dispositivo.nombre_dispositivo : 'Desconocido',
        username: dispositivo ? dispositivo.username : 'Desconocido',
        ip_asignada: dispositivo ? dispositivo.ip_asignada : peer.allowed_ips
      };
    });

    res.json(peersEnriquecidos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;