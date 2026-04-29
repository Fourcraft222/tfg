const pool = require('./db');

const createTables = async () => {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      rol VARCHAR(10) DEFAULT 'usuario',
      fecha_alta TIMESTAMP DEFAULT NOW(),
      activo BOOLEAN DEFAULT true
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      nombre VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      fecha_alta TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS credenciales (
      id SERIAL PRIMARY KEY,
      cliente_id INTEGER REFERENCES clientes(id),
      nombre_dispositivo VARCHAR(100) DEFAULT 'Dispositivo',
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
      usuario_id INTEGER REFERENCES usuarios(id),
      accion VARCHAR(50) NOT NULL,
      detalle TEXT,
      fecha TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS configuracion (
      clave VARCHAR(50) PRIMARY KEY,
      valor VARCHAR(100) NOT NULL
    );
  `);
  // Insertar modo por defecto si no existe
  await pool.query(`
    INSERT INTO configuracion (clave, valor)
    VALUES ('modo_web', 'abierto')
    ON CONFLICT (clave) DO NOTHING;
  `);

  console.log('Tablas creadas correctamente');
};

module.exports = createTables;