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

      // Obtener snapshot de ayer para calcular solo el consumo de hoy
      const ayer = await pool.query(
        `SELECT rx_bytes, tx_bytes FROM trafico_diario
         WHERE credencial_id = $1 AND fecha = CURRENT_DATE - INTERVAL '1 day'`,
        [dispositivo.id]
      );

      let rxDia = rxTotal;
      let txDia = txTotal;

      if (ayer.rows.length > 0) {
        const rxDiff = rxTotal - ayer.rows[0].rx_bytes;
        const txDiff = txTotal - ayer.rows[0].tx_bytes;
	rxDia = rxDiff < 0 ? rxTotal : rxDiff;
	txDia = txDiff < 0 ? txTotal : txDiff;
      }

      await pool.query(
        `INSERT INTO trafico_diario (credencial_id, fecha, rx_bytes, tx_bytes)
         VALUES ($1, CURRENT_DATE, $2, $3)
         ON CONFLICT (credencial_id, fecha)
         DO UPDATE SET rx_bytes = $2, tx_bytes = $3`,
        [dispositivo.id, rxDia, txDia]
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