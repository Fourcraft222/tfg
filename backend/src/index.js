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

// Programar snapshot de trafico diario a las 23:59 AM UTC
const programarSnapshotDiario = () => {
  const ahora = new Date();
  const proximasPM = new Date();
  proximasPM.setHours(23, 59, 0, 0);
  if (ahora >= proximasPM) {
    proximasPM.setDate(proximasPM.getDate() + 1);
  }

  const msHastaPM = proximasPM - ahora;
  console.log(`Proximo snapshot en ${Math.round(msHastaPM / 1000 / 60)} minutos`);

  setTimeout(() => {
    guardarSnapshotDiario();
    setInterval(guardarSnapshotDiario, 24 * 60 * 60 * 1000);
  }, msHastaPM);
};

createTables().then(() => {
  crearAdmin();
  renovarCredenciales();
  setInterval(renovarCredenciales, 24 * 60 * 60 * 1000);
  programarSnapshotDiario();
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
