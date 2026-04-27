document.addEventListener('DOMContentLoaded', () => {
  verificarSesion('admin');
  document.getElementById('bienvenida').textContent = 'Hola, ' + getUsername();
  cargarUsuarios();
  cargarDispositivos();
  cargarStats();

  // Actualizar cada 1 minuto
  setInterval(() => {
    cargarUsuarios();
    cargarDispositivos();
    cargarStats();
  }, 60000);
});

function cambiarTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('activa'));
  document.querySelectorAll('.seccion').forEach(s => s.classList.remove('visible'));
  if (tab === 'usuarios') {
    document.querySelectorAll('.tab')[0].classList.add('activa');
    document.getElementById('seccion-usuarios').classList.add('visible');
  } else {
    document.querySelectorAll('.tab')[1].classList.add('activa');
    document.getElementById('seccion-dispositivos').classList.add('visible');
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
      <td>${u.email}</td>
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
  const email = document.getElementById('nuevo-email').value.trim();
  const errorDiv = document.getElementById('error-usuario');
  const passwordDiv = document.getElementById('password-generada');
  const passwordValor = document.getElementById('password-valor');

  errorDiv.textContent = '';
  passwordDiv.style.display = 'none';

  if (!username || !email) {
    errorDiv.textContent = 'Username y email son obligatorios';
    return;
  }
  const res = await fetch('/api/admin/usuarios', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    },
    body: JSON.stringify({ username, email })
  });

  const data = await res.json();

  if (!res.ok) {
    errorDiv.textContent = data.error;
    return;
  }

  passwordValor.textContent = data.password;
  passwordDiv.style.display = 'block';
  document.getElementById('nuevo-username').value = '';
  document.getElementById('nuevo-email').value = '';
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