// Cargar clientes al arrancar la pagina
document.addEventListener('DOMContentLoaded', cargarClientes);

async function cargarClientes() {
  const res = await fetch('/api/clientes');
  const clientes = await res.json();
  const tbody = document.getElementById('tabla-clientes');

  if (clientes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:#888; text-align:center;">No hay clientes</td></tr>';
    return;
  }

  tbody.innerHTML = clientes.map(c => `
    <tr>
      <td>${c.id}</td>
      <td>${c.nombre}</td>
      <td>${c.email}</td>
      <td>${c.ip_asignada || '0.0.0.0'}</td>
      <td>${c.fecha_expiracion ? new Date(c.fecha_expiracion).toLocaleDateString('es-ES') : '-'}</td>
      <td><span class="badge ${c.estado}">${c.estado}</span></td>
      <td>
        ${c.estado === 'activo' ? `
	  <button class="btn-small" onclick="descargarConf(${c.id})">Archivo conf</button>
  	  <button class="btn-small" onclick="verQR(${c.id})">Ver QR</button>
          <button class="btn-small btn-danger" onclick="darBaja(${c.id})">Dar de baja</button>
          <button class="btn-small btn-danger" onclick="revocarCredencial(${c.id})">Revocar</button>
        ` : '-'}
      </td>
    </tr>
  `).join('');
}

async function crearCliente() {
  const nombre = document.getElementById('nombre').value.trim();
  const email = document.getElementById('email').value.trim();

  if (!nombre || !email) {
    alert('Nombre y email son obligatorios');
    return;
  }

  const res = await fetch('/api/clientes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, email })
  });

  const data = await res.json();
  if (res.ok) {
    document.getElementById('nombre').value = '';
    document.getElementById('email').value = '';
    cargarClientes();
  } else {
    alert('Error: ' + data.error);
  }
}

async function darBaja(id) {
  if (!confirm('Seguro que quieres dar de baja a este cliente?')) return;
  const res = await fetch(`/api/clientes/${id}/baja`, { method: 'PUT' });
  const data = await res.json();
  if (res.ok) cargarClientes();
  else alert('Error: ' + data.error);
}

async function revocarCredencial(id) {
  if (!confirm('Seguro que quieres revocar la credencial?')) return;
  const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (res.ok) cargarClientes();
  else alert('Error: ' + data.error);
}

function descargarConf(id) {
  window.location.href = `/api/clientes/${id}/conf`;
}

async function verQR(id) {
  const res = await fetch(`/api/clientes/${id}/qr`);
  const data = await res.json();
  if (res.ok) {
    const ventana = window.open('', '_blank', 'width=350,height=350');
    ventana.document.write(`
      <html><body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#0f1117">
        <img src="${data.qr}" style="width:300px;height:300px">
      </body></html>
    `);
  } else {
    alert('Error: ' + data.error);
  }
}

