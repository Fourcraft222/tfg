const pool = require('./db');

const createTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      fecha_alta TIMESTAMP DEFAULT NOW(),
      estado VARCHAR(20) DEFAULT 'activo'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS credenciales (
      id SERIAL PRIMARY KEY,
      cliente_id INTEGER REFERENCES clientes(id),
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL,
      ip_asignada VARCHAR(20) NOT NULL,
      fecha_emision TIMESTAMP DEFAULT NOW(),
      fecha_expiracion TIMESTAMP NOT NULL,
      estado VARCHAR(20) DEFAULT 'activa',
      auto_renew BOOLEAN DEFAULT true
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      cliente_id INTEGER REFERENCES clientes(id),
      accion VARCHAR(50) NOT NULL,
      detalle TEXT,
      fecha TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log('Tablas creadas correctamente');
};

module.exports = createTables;
