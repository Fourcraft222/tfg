const pool = require('./db');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const renovarCredenciales = async () => {
  try {
    // Buscar credenciales expiradas
    const expiradas = await pool.query(
      `SELECT cr.*, c.nombre, u.id as usuario_id FROM credenciales cr
       JOIN clientes c ON c.id = cr.cliente_id
       JOIN usuarios u ON u.id = c.usuario_id
       WHERE cr.estado = 'activa'
       AND cr.fecha_expiracion <= NOW()`
    );

    for (const cred of expiradas.rows) {
      console.log(`Credencial expirada del cliente ${cred.nombre}, eliminando peer...`);

      // Eliminar peer de WireGuard
      await execPromise(
        `docker exec mi-wireguard wg set wg0 peer ${cred.public_key} remove`
      );
      await execPromise(
         'docker exec mi-wireguard wg-quick save wg0'
      );

      if (cred.auto_renew) {
        // Generar nuevas claves
        const { stdout: privateKey } = await execPromise(
          'docker exec mi-wireguard wg genkey'
        );
        const privKey = privateKey.trim();
        const { stdout: publicKey } = await execPromise(
          `echo ${privKey} | docker exec -i mi-wireguard wg pubkey`
        );
        const pubKey = publicKey.trim();
	
	//Añadir nuevo peer con misma IP
        await execPromise(
          `docker exec mi-wireguard wg set wg0 peer ${pubKey} allowed-ips ${cred.ip_asignada}/32`
        );
	await execPromise(
	  'docker exec mi-wireguard wg-quick save wg0'
	);

        // Calcular nueva fecha de expiracion
        const nuevaExpiracion = new Date();
        nuevaExpiracion.setFullYear(nuevaExpiracion.getFullYear() + 1);

        // Actualizar credencial en la base de datos
        await pool.query(
          `UPDATE credenciales SET
            public_key = $1,
            private_key = $2,
            fecha_emision = NOW(),
            fecha_expiracion = $3
           WHERE id = $4`,
          [pubKey, privKey, nuevaExpiracion, cred.id]
        );

        // Guardar log
        await pool.query(
          'INSERT INTO logs (usuario_id, accion, detalle) VALUES ($1, $2, $3)',
          [cred.usuario_id, 'credencial_renovada', `Nueva expiracion: ${nuevaExpiracion.toISOString()}`]
        );

        console.log(`Credencial del cliente ${cred.nombre} renovada correctamente`);

      } else {
        // Sin auto_renew, marcar como expirada
        await pool.query(
          `UPDATE credenciales SET estado = 'expirada', ip_asignada = '0.0.0.0'
           WHERE id = $1`,
          [cred.id]
        );

        // Guardar log
        await pool.query(
          'INSERT INTO logs (usuario_id, accion) VALUES ($1, $2)',
          [cred.usuario_id, 'credencial_expirada']
        );

        console.log(`Credencial del cliente ${cred.nombre} expirada sin renovacion`);
      }
    }

  } catch (error) {
    console.error('Error en la renovacion:', error.message);
  }
};

module.exports = renovarCredenciales;