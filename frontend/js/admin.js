document.addEventListener('DOMContentLoaded', () => {
  verificarSesion('admin');
  document.getElementById('bienvenida').textContent = 'Hola, ' + getUsername();
  cargarUsuarios();
  cargarDispositivos();
  cargarStats();
  cargarModo();
  cargarTrafico();

  // Actualizar cada 1 minuto
  setInterval(() => {
    cargarUsuarios();
    cargarDispositivos();
    cargarStats();
  }, 60000);

  //Actualizar cada segundo el trafico de usuarios
  setInterval(() => {
    cargarTrafico();
  }, 1000);
});

let traficoAnterior = {};
let tiempoAnterior = Date.now();

function cambiarTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('activa'));
  document.querySelectorAll('.seccion').forEach(s => s.classList.remove('visible'));

  if (tab === 'usuarios') {
    document.querySelectorAll('.tab')[0].classList.add('activa');
    document.getElementById('seccion-usuarios').classList.add('visible');
  } else if (tab === 'dispositivos') {
    document.querySelectorAll('.tab')[1].classList.add('activa');
    document.getElementById('seccion-dispositivos').classList.add('visible');
  } else {
    document.querySelectorAll('.tab')[2].classList.add('activa');
    document.getElementById('seccion-trafico').classList.add('visible');
  }
}

async function cargarStats() {
  const resUsuarios = await fetch('/api/admin/usuarios', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  if (resUsuarios.status === 403 || resUsuarios.status === 401) { cerrarSesion(); return; }
  const usuarios = await resUsuarios.json();

  const resDispositivos = await fetch('/api/admin/dispositivos', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  if (resDispositivos.status === 403 || resDispositivos.status === 401) { cerrarSesion(); return; }
  const dispositivos = await resDispositivos.json();

  const activos = dispositivos.filter(d => d.estado === 'activa').length;
  document.getElementById('total-usuarios').textContent = usuarios.length;
  document.getElementById('total-dispositivos').textContent = activos;
  document.getElementById('total-peers').textContent = activos;
}

async function cargarUsuarios() {
  const res = await fetch('/api/admin/usuarios', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  if (res.status === 403 || res.status === 401) { cerrarSesion(); return; }
  const usuarios = await res.json();
  const tbody = document.getElementById('tabla-usuarios');

  if (usuarios.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:#888;text-align:center">No hay usuarios</td></tr>';
    return;
  }

  tbody.innerHTML = usuarios.map(u => `
    <tr>
      <td>${u.username}</td>
      <td><span class="badge ${u.rol}">${u.rol.charAt(0).toUpperCase() + u.rol.slice(1)}</span></td>
      <td>${u.num_dispositivos}</td>
      <td><span class="badge ${u.activo ? 'activo' : 'cancelado'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        ${u.rol !== 'admin' ? `
          ${u.activo
            ? `<button class="btn-small btn-warning" onclick="desactivarUsuario(${u.id})">Desactivar</button>`
            : `<button class="btn-small" onclick="activarUsuario(${u.id})">Activar</button>`
          }
          <button class="btn-small btn-danger" onclick="eliminarUsuario(${u.id})">Eliminar</button>
        ` : '-'}
      </td>
    </tr>
  `).join('');
}

async function cargarDispositivos() {
  const res = await fetch('/api/admin/dispositivos', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  if (res.status === 403 || res.status === 401) { cerrarSesion(); return; }
  const dispositivos = await res.json();
  const tbody = document.getElementById('tabla-dispositivos');

  if (dispositivos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:#888;text-align:center">No hay dispositivos</td></tr>';
    return;
  }

  tbody.innerHTML = dispositivos.map(d => `
    <tr>
      <td>${d.username}</td>
      <td>${d.nombre_dispositivo}</td>
      <td>${d.ip_asignada}</td>
      <td>${d.fecha_expiracion ? new Date(d.fecha_expiracion).toLocaleDateString('es-ES') : '-'}</td>
      <td><span class="badge ${d.estado}">${d.estado === 'revocada' ? 'Eliminada' : d.estado.charAt(0).toUpperCase() + d.estado.slice(1)}</span></td>
      <td>${d.auto_renew ? 'Si' : 'No'}</td>
      <td>
        ${d.estado !== 'revocada' ? `
          <button class="btn-small ${d.estado === 'activa' ? 'btn-warning' : ''}"
            onclick="toggleDispositivo(${d.id})">
            ${d.estado === 'activa' ? 'Pausar' : 'Activar'}
          </button>
          <button class="btn-small btn-danger" onclick="eliminarDispositivo(${d.id})">Eliminar</button>
          </button>
        ` : '-'}
      </td>
    </tr>
  `).join('');
}

async function crearUsuario() {
  const username = document.getElementById('nuevo-username').value.trim();
  const errorDiv = document.getElementById('error-usuario');
  const passwordDiv = document.getElementById('password-generada');
  const passwordValor = document.getElementById('password-valor');

  errorDiv.textContent = '';
  passwordDiv.style.display = 'none';

  if (!username) {
    errorDiv.textContent = 'Username es obligatorio';
    return;
  }
  const res = await fetch('/api/admin/usuarios', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    },
    body: JSON.stringify({ username })
  });

  const data = await res.json();

  if (!res.ok) {
    errorDiv.textContent = data.error;
    return;
  }

  passwordValor.textContent = data.password;
  passwordDiv.style.display = 'block';
  document.getElementById('nuevo-username').value = '';
  cargarUsuarios();
  cargarStats();
}

async function desactivarUsuario(id) {
  if (!confirm('Seguro que quieres desactivar este usuario?')) return;

  const res = await fetch(`/api/admin/usuarios/${id}/desactivar`, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });

  if (res.ok) {
    cargarUsuarios();
    cargarStats();
  }
}
async function toggleDispositivo(id) {
  const res = await fetch(`/api/admin/dispositivos/${id}/toggle`, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  const data = await res.json();
  if (res.ok) {
    cargarDispositivos();
    cargarStats();
  } else {
    alert('Error: ' + data.error);
  }
}

async function activarUsuario(id) {
  const res = await fetch(`/api/admin/usuarios/${id}/activar`, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  if (res.ok) {
    cargarUsuarios();
    cargarStats();
  }
}

async function eliminarUsuario(id) {
  if (!confirm('Seguro que quieres eliminar este usuario? Esta accion no se puede deshacer.')) return;
  const res = await fetch(`/api/admin/usuarios/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  if (res.ok) {
    cargarUsuarios();
    cargarDispositivos();
    cargarStats();
  }
}
async function eliminarDispositivo(id) {
  if (!confirm('Seguro que quieres eliminar este dispositivo?')) return;
  const res = await fetch(`/api/admin/dispositivos/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  if (res.ok) {
    cargarDispositivos();
    cargarStats();
  } else {
    const data = await res.json();
    alert('Error: ' + data.error);
  }
}
async function cargarModo() {
  const res = await fetch('/api/admin/modo', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  if (res.status === 403 || res.status === 401) { cerrarSesion(); return; }
  const data = await res.json();
  actualizarBadgeModo(data.modo);
}

function actualizarBadgeModo(modo) {
  const badge = document.getElementById('modo-badge');
  const btn = document.getElementById('btn-modo');
  if (modo === 'abierto') {
    badge.textContent = 'Abierto';
    badge.className = 'badge activo';
    btn.textContent = 'Cambiar a Cerrado';
    btn.className = 'btn btn-warning';
    btn.style.width = 'auto';
  } else {
    badge.textContent = 'Cerrado';
    badge.className = 'badge cancelado';
    btn.textContent = 'Cambiar a Abierto';
    btn.className = 'btn';
    btn.style.width = 'auto';
  }
}

async function cambiarModo() {
  const badge = document.getElementById('modo-badge');
  const modoActual = badge.textContent.toLowerCase();
  const nuevoModo = modoActual === 'abierto' ? 'cerrado' : 'abierto';

  if (!confirm(`Seguro que quieres cambiar el modo a ${nuevoModo}?`)) return;

  const res = await fetch('/api/admin/modo', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    },
    body: JSON.stringify({ modo: nuevoModo })
  });

  const data = await res.json();
  if (res.ok) {
    actualizarBadgeModo(nuevoModo);
  } else {
    alert('Error: ' + data.error);
  }
}
async function cargarTrafico() {
  const res = await fetch('/api/admin/trafico', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  if (res.status === 403 || res.status === 401) { cerrarSesion(); return; }
  const peers = await res.json();
  const tbody = document.getElementById('tabla-trafico');
  const ahora = Date.now();
  const segundos = (ahora - tiempoAnterior) / 1000;

  if (peers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="color:#888;text-align:center">No hay peers activos</td></tr>';
    return;
  }

  tbody.innerHTML = peers.map(p => {
    const anterior = traficoAnterior[p.public_key];
    let rxVelocidad = 0;
    let txVelocidad = 0;

    if (anterior && segundos > 0) {
      rxVelocidad = (p.rx_bytes - anterior.rx_bytes) / segundos;
      txVelocidad = (p.tx_bytes - anterior.tx_bytes) / segundos;
    }

    traficoAnterior[p.public_key] = { rx_bytes: p.rx_bytes, tx_bytes: p.tx_bytes };

    return `
      <tr>
        <td>${p.username}</td>
        <td>${p.nombre_dispositivo}</td>
        <td>${p.ip_asignada}</td>
        <td><span class="badge ${p.conectado ? 'activo' : 'cancelado'}">${p.conectado ? 'Conectado' : 'Desconectado'}</span></td>
        <td>${formatBytes(p.rx_bytes)}</td>
        <td>${formatBytes(p.tx_bytes)}</td>
        <td style="color:var(--success)">${formatBytes(rxVelocidad)}/s</td>
        <td style="color:var(--accent)">${formatBytes(txVelocidad)}/s</td>
        <td>${p.last_handshake > 0 ? new Date(p.last_handshake * 1000).toLocaleString('es-ES') : '-'}</td>
      </tr>
    `;
  }).join('');

  tiempoAnterior = ahora;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}