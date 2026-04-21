const express = require('express');
const router = express.Router();
const pool = require('./db');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const QRCode = require('qrcode');

// Funcion para generar claves WireGuard
const generarClaves = async () => {
  const { stdout: privateKey } = await execPromise(
    'docker exec mi-wireguard wg genkey'
  );
  const privKey = privateKey.trim();
  const { stdout: publicKey } = await execPromise(
    `echo ${privKey} | docker exec -i mi-wireguard wg pubkey`
  );
  return {
    privateKey: privKey,
    publicKey: publicKey.trim()
  };
};

// Funcion para calcular la siguiente IP disponible
const siguienteIP = async () => {
  const result = await pool.query(
    `SELECT ip_asignada FROM credenciales 
     WHERE ip_asignada != '0.0.0.0' AND estado = 'activa'
     ORDER BY ip_asignada`
  );

  // Buscar el primer hueco disponible desde 10.0.0.2
  let esperada = 2;
  for (const row of result.rows) {
    const ultimo = parseInt(row.ip_asignada.split('.')[3]);
    if (ultimo !== esperada) return `10.0.0.${esperada}`;
    esperada++;
  }
  return `10.0.0.${esperada}`;
};

// POST /api/clientes - Crear cliente y generar credencial
router.post('/clientes', async (req, res) => {
  const { nombre, email } = req.body;
  if (!nombre || !email) {
    return res.status(400).json({ error: 'Nombre y email son obligatorios' });
  }

  try {
    // Crear cliente en la base de datos
    const cliente = await pool.query(
      'INSERT INTO clientes (nombre, email) VALUES ($1, $2) RETURNING *',
      [nombre, email]
    );
    const clienteId = cliente.rows[0].id;

    // Generar claves WireGuard
    const { privateKey, publicKey } = await generarClaves();

    // Calcular IP y fecha de expiracion
    const ip = await siguienteIP();
    const fechaExpiracion = new Date();
    fechaExpiracion.setFullYear(fechaExpiracion.getFullYear() + 1);

    // Guardar credencial en la base de datos
    const credencial = await pool.query(
      `INSERT INTO credenciales 
        (cliente_id, public_key, private_key, ip_asignada, fecha_expiracion)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [clienteId, publicKey, privateKey, ip, fechaExpiracion]
    );

    // Anadir peer a WireGuard en caliente
    await execPromise(
      `docker exec mi-wireguard wg set wg0 peer ${publicKey} allowed-ips ${ip}/32`
    );
    // Guardar log
    await pool.query(
      'INSERT INTO logs (cliente_id, accion, detalle) VALUES ($1, $2, $3)',
      [clienteId, 'credencial_creada', `IP asignada: ${ip}`]
    );

    res.status(201).json({
      cliente: cliente.rows[0],
      credencial: credencial.rows[0]
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/clientes - Listar todos los clientes
router.get('/clientes', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, cr.ip_asignada, cr.estado as estado_credencial, 
              cr.fecha_expiracion
       FROM clientes c
       LEFT JOIN credenciales cr ON c.id = cr.cliente_id`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/clientes/:id - Revocar credencial
router.delete('/clientes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const credencial = await pool.query(
      'SELECT public_key FROM credenciales WHERE cliente_id = $1',
      [id]
    );
    if (credencial.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const publicKey = credencial.rows[0].public_key;

    // Eliminar peer de WireGuard
    await execPromise(
      `docker exec mi-wireguard wg set wg0 peer ${publicKey} remove`
    );

    // Actualizar estado en la base de datos
    await pool.query(
	'UPDATE credenciales SET estado = $1, ip_asignada = $2 WHERE cliente_id = $3',
	['revocada', '0.0.0.0', id]
    );

    // Guardar log
    await pool.query(
      'INSERT INTO logs (cliente_id, accion) VALUES ($1, $2)',
      [id, 'credencial_revocada']
    );

    res.json({ mensaje: 'Credencial revocada correctamente' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/clientes/:id/baja - Dar de baja a un cliente
router.put('/clientes/:id/baja', async (req, res) => {
  const { id } = req.params;
  try {
    // Buscar credencial activa
    const credencial = await pool.query(
      'SELECT public_key FROM credenciales WHERE cliente_id = $1 AND estado = $2',
      [id, 'activa']
    );

    // Si tiene credencial activa, eliminar peer de WireGuard
    if (credencial.rows.length > 0) {
      const publicKey = credencial.rows[0].public_key;
      await execPromise(
        `docker exec mi-wireguard wg set wg0 peer ${publicKey} remove`
      );
      await pool.query(
	'UPDATE credenciales SET estado = $1, ip_asignada = $2 WHERE cliente_id = $3',
	['revocada', '0.0.0.0', id]
      );
    }

    // Dar de baja al cliente
    await pool.query(
      'UPDATE clientes SET estado = $1 WHERE id = $2',
      ['cancelado', id]
    );

    // Guardar log
    await pool.query(
      'INSERT INTO logs (cliente_id, accion) VALUES ($1, $2)',
      [id, 'cliente_cancelado']
    );

    res.json({ mensaje: 'Cliente dado de baja correctamente' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/clientes/:id/conf - Generar archivo de configuracion WireGuard
router.get('/clientes/:id/conf', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT cr.*, c.nombre FROM credenciales cr
       JOIN clientes c ON c.id = cr.cliente_id
       WHERE cr.cliente_id = $1 AND cr.estado = 'activa'`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No hay credencial activa para este cliente' });
    }

    const cred = result.rows[0];
    const SERVER_PUBLIC_KEY = process.env.SERVER_PUBLIC_KEY;
    const SERVER_ENDPOINT = process.env.SERVER_ENDPOINT;

    const conf = `[Interface]
PrivateKey = ${cred.private_key}
Address = ${cred.ip_asignada}/32
DNS = 1.1.1.1

[Peer]
PublicKey = ${SERVER_PUBLIC_KEY}
Endpoint = ${SERVER_ENDPOINT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="cliente-${id}.conf"`);
    res.send(conf);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/clientes/:id/qr - Generar QR del archivo de configuracion
router.get('/clientes/:id/qr', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT cr.*, c.nombre FROM credenciales cr
       JOIN clientes c ON c.id = cr.cliente_id
       WHERE cr.cliente_id = $1 AND cr.estado = 'activa'`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No hay credencial activa para este cliente' });
    }

    const cred = result.rows[0];
    const SERVER_PUBLIC_KEY = process.env.SERVER_PUBLIC_KEY;
    const SERVER_ENDPOINT = process.env.SERVER_ENDPOINT;

    const conf = `[Interface]
PrivateKey = ${cred.private_key}
Address = ${cred.ip_asignada}/32
DNS = 1.1.1.1

[Peer]
PublicKey = ${SERVER_PUBLIC_KEY}
Endpoint = ${SERVER_ENDPOINT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25`;

    const qr = await QRCode.toDataURL(conf);
    res.json({ qr });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
