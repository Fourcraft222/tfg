const express = require('express');
const createTables = require('./schema');
const routes = require('./routes');
const path = require('path');
const renovarCredenciales = require('./renovacion');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

//Crear tablas al arrancar, despues ejecutar renovacion y luego comprobar cada 24 horas
createTables().then(() => {
  renovarCredenciales();
  setInterval(renovarCredenciales, 24 * 60 * 60 * 1000);
});

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

