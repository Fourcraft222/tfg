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

    await pool.query(
      `INSERT INTO usuarios (username, email, password, rol)
       VALUES ($1, $2, $3, 'admin')`,
      [process.env.ADMIN_USERNAME, 'admin@vpnaas.local', passwordHash]
    );

    console.log('Admin creado correctamente');
  } catch (error) {
    console.error('Error al crear admin:', error.message);
  }
};

module.exports = crearAdmin;