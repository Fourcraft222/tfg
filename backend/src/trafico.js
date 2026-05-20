const pool = require('./db');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const guardarSnapshotDiario = async () => {
  try {
    const { stdout } = await execPromise('docker exec mi-wireguard wg show wg0 dump');
    const lineas = stdout.trim().split('\n').slice(1);

    const dispositivos = await pool.query(
      `SELECT cr.id, cr.public_key FROM credenciales cr
       WHERE cr.estado = 'activa'`
    );

    for (const dispositivo of dispositivos.rows) {
      const linea = lineas.find(l => l.startsWith(dispositivo.public_key));
      if (!linea) continue;

      const partes = linea.split('\t');
      const rxTotal = parseInt(partes[5]) || 0;
      const txTotal = parseInt(partes[6]) || 0;

      await pool.query(
        `INSERT INTO trafico_diario (credencial_id, fecha, rx_bytes, tx_bytes)
         VALUES ($1, CURRENT_DATE, $2, $3)
         ON CONFLICT (credencial_id, fecha)
         DO UPDATE SET rx_bytes = $2, tx_bytes = $3`,
        [dispositivo.id, rxTotal, txTotal]
      );
    }
    
    // Eliminar registros mas antiguos de 30 dias
    await pool.query(
      `DELETE FROM trafico_diario WHERE fecha < CURRENT_DATE - INTERVAL '30 days'`
    );

    console.log('Snapshot de trafico guardado correctamente');
  } catch (error) {
    console.error('Error al guardar snapshot de trafico:', error.message);
  }
};

module.exports = guardarSnapshotDiario;