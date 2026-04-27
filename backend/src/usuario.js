const express = require('express');
const router = express.Router();
const pool = require('./db');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const QRCode = require('qrcode');
const bcrypt = require('bcrypt');
const { verificarToken } = require('./auth');

router.use(verificarToken);

// Funcion para generar claves WireGuard
const generarClaves = async () => {
  const { stdout: privateKey } = await execPromise(
    'docker exec mi-wireguard wg genkey'
  );
  const privKey = privateKey.trim();
  const { stdout: publicKey } = await execPromise(
    `echo ${privKey} | docker exec -i mi-wireguard wg pubkey`
  );
  return { privateKey: privKey, publicKey: publicKey.trim() };
};

// Funcion para calcular la siguiente IP disponible
const siguienteIP = async () => {
  const result = await pool.query(
    `SELECT ip_asignada FROM credenciales 
     WHERE ip_asignada != '0.0.0.0' AND estado = 'activa'
     ORDER BY ip_asignada`
  );
  let esperada = 2;
  for (const row of result.rows) {
    const ultimo = parseInt(row.ip_asignada.split('.')[3]);
    if (ultimo !== esperada) return `10.0.0.${esperada}`;
    esperada++;
  }
  return `10.0.0.${esperada}`;
};

// GET /api/usuario/dispositivos - Ver mis dispositivos
router.get('/dispositivos', async (req, res) => {
  try {
    const cliente = await pool.query(
      'SELECT id FROM clientes WHERE usuario_id = $1',
      [req.usuario.id]
    );
    if (cliente.rows.length === 0) {
      return res.json([]);
    }
    const clienteId = cliente.rows[0].id;
    const result = await pool.query(
      'SELECT * FROM credenciales WHERE cliente_id = $1 ORDER BY fecha_emision DESC',
      [clienteId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/usuario/dispositivos - Agregar dispositivo (max 5)
router.post('/dispositivos', async (req, res) => {
  const { nombre_dispositivo } = req.body;
  try {
    const cliente = await pool.query(
      'SELECT id FROM clientes WHERE usuario_id = $1',
      [req.usuario.id]
    );
    const clienteId = cliente.rows[0].id;

    // Verificar que el usuario sigue activo
    const usuarioActivo = await pool.query(
      'SELECT activo FROM usuarios WHERE id = $1',
      [req.usuario.id]
    );
    if (!usuarioActivo.rows[0].activo) {
      return res.status(403).json({ error: 'Usuario desactivado' });
    }

    // Verificar limite de 5 dispositivos
    const count = await pool.query(
      `SELECT COUNT(*) FROM credenciales 
       WHERE cliente_id = $1 AND estado = 'activa'`,
      [clienteId]
    );
    if (parseInt(count.rows[0].count) >= 5) {
      return res.status(400).json({ error: 'Limite de 5 dispositivos alcanzado' });
    }

    // Generar claves y asignar IP
    const { privateKey, publicKey } = await generarClaves();
    const ip = await siguienteIP();
    const fechaExpiracion = new Date();
    fechaExpiracion.setFullYear(fechaExpiracion.getFullYear() + 1);

    const credencial = await pool.query(
      `INSERT INTO credenciales 
        (cliente_id, nombre_dispositivo, public_key, private_key, ip_asignada, fecha_expiracion)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [clienteId, nombre_dispositivo || 'Dispositivo', publicKey, privateKey, ip, fechaExpiracion]
    );

//Añadir y guardar peer a WireGuard
    await execPromise(
      `docker exec mi-wireguard wg set wg0 peer ${publicKey} allowed-ips ${ip}/32`
    );
    await execPromise(
      'docker exec mi-wireguard wg-quick save wg0'
    );

    // Guardar log
    await pool.query(
      'INSERT INTO logs (usuario_id, accion, detalle) VALUES ($1, $2, $3)',
      [req.usuario.id, 'dispositivo_creado', `IP: ${ip}, Dispositivo: ${nombre_dispositivo}`]
    );

    res.status(201).json(credencial.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/usuario/dispositivos/:id - Revocar dispositivo
router.delete('/dispositivos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Verificar que el dispositivo pertenece al usuario
    const result = await pool.query(
      `SELECT cr.* FROM credenciales cr
       JOIN clientes c ON c.id = cr.cliente_id
       WHERE cr.id = $1 AND c.usuario_id = $2`,
      [id, req.usuario.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const cred = result.rows[0];

    // Eliminar y guardar peer de WireGuard
    await execPromise(
      `docker exec mi-wireguard wg set wg0 peer ${cred.public_key} remove`
    );
    await execPromise(
      'docker exec mi-wireguard wg-quick save wg0'
    );

    // Actualizar estado
    await pool.query(
      `UPDATE credenciales SET estado = 'revocada', ip_asignada = '0.0.0.0'
       WHERE id = $1`,
      [id]
    );

    await pool.query(
      'INSERT INTO logs (usuario_id, accion) VALUES ($1, $2)',
      [req.usuario.id, 'dispositivo_revocado']
    );

    res.json({ mensaje: 'Dispositivo revocado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/usuario/dispositivos/:id/autorenew - Cambiar auto renovacion
router.put('/dispositivos/:id/autorenew', async (req, res) => {
  const { id } = req.params;
  const { auto_renew } = req.body;
  try {
    // Verificar que pertenece al usuario
    const result = await pool.query(
      `SELECT cr.* FROM credenciales cr
       JOIN clientes c ON c.id = cr.cliente_id
       WHERE cr.id = $1 AND c.usuario_id = $2`,
      [id, req.usuario.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    await pool.query(
      'UPDATE credenciales SET auto_renew = $1 WHERE id = $2',
      [auto_renew, id]
    );

    res.json({ mensaje: `Auto renovacion ${auto_renew ? 'activada' : 'desactivada'}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/usuario/dispositivos/:id/conf - Descargar conf
router.get('/dispositivos/:id/conf', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT cr.* FROM credenciales cr
       JOIN clientes c ON c.id = cr.cliente_id
       WHERE cr.id = $1 AND c.usuario_id = $2 AND cr.estado = 'activa'`,
      [id, req.usuario.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const cred = result.rows[0];
    const conf = `[Interface]
PrivateKey = ${cred.private_key}
Address = ${cred.ip_asignada}/32
DNS = 1.1.1.1

[Peer]
PublicKey = ${process.env.SERVER_PUBLIC_KEY}
Endpoint = ${process.env.SERVER_ENDPOINT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${cred.nombre_dispositivo}.conf"`);
    res.send(conf);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/usuario/dispositivos/:id/qr - Ver QR
router.get('/dispositivos/:id/qr', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT cr.* FROM credenciales cr
       JOIN clientes c ON c.id = cr.cliente_id
       WHERE cr.id = $1 AND c.usuario_id = $2 AND cr.estado = 'activa'`,
      [id, req.usuario.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const cred = result.rows[0];
    const conf = `[Interface]
PrivateKey = ${cred.private_key}
Address = ${cred.ip_asignada}/32
DNS = 1.1.1.1

[Peer]
PublicKey = ${process.env.SERVER_PUBLIC_KEY}
Endpoint = ${process.env.SERVER_ENDPOINT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;

    const qr = await QRCode.toDataURL(conf);
    res.json({ qr });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/usuario/password - Cambiar contrasena
router.put('/password', async (req, res) => {
  const { password_actual, password_nueva } = req.body;

  if (!password_actual || !password_nueva) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  if (password_nueva.length < 6) {
    return res.status(400).json({ error: 'La contrasena nueva debe tener al menos 6 caracteres' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE id = $1',
      [req.usuario.id]
    );

    const usuario = result.rows[0];
    const passwordCorrecta = await bcrypt.compare(password_actual, usuario.password);

    if (!passwordCorrecta) {
      return res.status(401).json({ error: 'La contrasena actual es incorrecta' });
    }

    const passwordHash = await bcrypt.hash(password_nueva, 10);

    await pool.query(
      'UPDATE usuarios SET password = $1 WHERE id = $2',
      [passwordHash, req.usuario.id]
    );

    await pool.query(
      'INSERT INTO logs (usuario_id, accion) VALUES ($1, $2)',
      [req.usuario.id, 'password_cambiada']
    );

    res.json({ mensaje: 'Contrasena cambiada correctamente' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;