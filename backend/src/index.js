const express = require('express');
const createTables = require('./schema');
const path = require('path');
const renovarCredenciales = require('./renovacion');
const adminRoutes = require('./admin');
const usuarioRoutes = require('./usuario');
const { login } = require('./auth');
const crearAdmin = require('./admin_gen');
const guardarSnapshotDiario = require('./trafico');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

createTables().then(() => {
  crearAdmin();
  renovarCredenciales();
  guardarSnapshotDiario();
  setInterval(renovarCredenciales, 24 * 60 * 60 * 1000);
  setInterval(guardarSnapshotDiario, 24 * 60 * 60 * 1000);
});

app.post('/api/auth/login', login);
app.use('/api/admin', adminRoutes);
app.use('/api/usuario', usuarioRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend funcionando' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
