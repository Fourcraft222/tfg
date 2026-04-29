const pool = require('./db');
const bcrypt = require('bcrypt');

const crearAdmin = async () => {
  try {
    const existe = await pool.query(
      'SELECT id FROM usuarios WHERE rol = $1',
      ['admin']
    );

    if (existe.rows.length > 0) {
      console.log('Admin ya existe');
      return;
    }

    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);

    const result = await pool.query(
      `INSERT INTO usuarios (username, password, rol)
       VALUES ($1, $2, 'admin') RETURNING id`,
      [process.env.ADMIN_USERNAME, passwordHash]
    );

    const adminId = result.rows[0].id;

    // Crear cliente asociado al admin
    await pool.query(
      `INSERT INTO clientes (usuario_id, nombre)
       VALUES ($1, $2)`,
      [adminId, process.env.ADMIN_USERNAME]
    );

    console.log('Admin creado correctamente');
  } catch (error) {
    console.error('Error al crear admin:', error.message);
  }
};

module.exports = crearAdmin;