const express = require('express');
const createTables = require('./schema');
const routes = require('./routes');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Crear tablas al arrancar
createTables();

// Rutas
app.use('/api', routes);

// Prueba
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend funcionando' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

