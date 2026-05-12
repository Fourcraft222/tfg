// Verificar sesion al cargar
document.addEventListener('DOMContentLoaded', () => {
  aplicarTema();
  verificarSesion();
  document.getElementById('bienvenida').textContent = 'Hola, ' + getUsername();
  cargarDispositivos();

  // Actualizar cada 1 minuto
  setInterval(() => {
    cargarDispositivos();
  }, 60000);

  if (getRol() === 'admin') {
    document.getElementById('btn-admin').style.display = 'inline-block';
  }
});

async function cargarDispositivos() {
  const res = await fetch('/api/usuario/dispositivos', {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });

  if (res.status === 403 || res.status === 401) {
    cerrarSesion();
    return;
  }

  const dispositivos = await res.json();
  const grid = document.getElementById('dispositivos-grid');
  const limiteInfo = document.getElementById('limite-info');
  const activos = dispositivos.filter(d => d.estado === 'activa').length;

  limiteInfo.textContent = getRol() === 'admin' 
  ? `${activos} dispositivos activos` 
  : `${activos} de 5 dispositivos activos`;
  grid.innerHTML = '';

  dispositivos.filter(d => d.estado === 'activa').forEach(d => {
    const card = document.createElement('div');
    card.className = 'dispositivo-card';
    card.innerHTML = `
      <div class="nombre">${d.nombre_dispositivo}</div>
      <div class="ip">IP: ${d.ip_asignada}</div>
      <div class="expiracion">Expira: ${new Date(d.fecha_expiracion).toLocaleDateString('es-ES')}</div>
      <div class="autorenew">
        <input type="checkbox" id="renew-${d.id}" ${d.auto_renew ? 'checked' : ''}
          onchange="cambiarAutoRenew(${d.id}, this.checked)">
        <label for="renew-${d.id}">Renovar automaticamente</label>
      </div>
      <div class="acciones">
        <button class="btn-small" onclick="descargarConf(${d.id}, '${d.nombre_dispositivo}')">Descargar .conf</button>
        <button class="btn-small" onclick="verQR(${d.id})">Ver QR</button>
        <button class="btn-small btn-danger" onclick="eliminarDispositivo(${d.id})">Eliminar</button>
      </div>
    `;
    grid.appendChild(card);
  });

  if (activos < 5 || getRol() === 'admin') {
    const addCard = document.createElement('div');
    addCard.className = 'add-dispositivo';
    addCard.onclick = abrirModal;
    addCard.innerHTML = `
      <div class="icono">+</div>
      <div>Agregar dispositivo</div>
    `;
    grid.appendChild(addCard);
  }
}

function abrirModal() {
  document.getElementById('modal-overlay').classList.add('visible');
  document.getElementById('modal-nombre').value = '';
  document.getElementById('modal-error').textContent = '';
}

function cerrarModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
}

async function confirmarAgregarDispositivo() {
  const nombre = document.getElementById('modal-nombre').value.trim();
  const errorDiv = document.getElementById('modal-error');

  if (!nombre) {
    errorDiv.textContent = 'El nombre es obligatorio';
    return;
  }

  const res = await fetch('/api/usuario/dispositivos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    },
    body: JSON.stringify({ nombre_dispositivo: nombre })
  });

  const data = await res.json();

  if (!res.ok) {
    errorDiv.textContent = data.error;
    return;
  }

  cerrarModal();
  cargarDispositivos();
}

async function cambiarAutoRenew(id, valor) {
  const res = await fetch(`/api/usuario/dispositivos/${id}/autorenew`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    },
    body: JSON.stringify({ auto_renew: valor })
  });

  if (!res.ok) {
    alert('Error al cambiar la configuracion');
    cargarDispositivos();
  }
}

async function eliminarDispositivo(id) {
  if (!confirm('Seguro que quieres eliminar este dispositivo?')) return;

  const res = await fetch(`/api/usuario/dispositivos/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });

  if (res.ok) cargarDispositivos();
  else alert('Error al revocar el dispositivo');
}

function descargarConf(id,nombre) {
  const token = getToken();
  fetch(`/api/usuario/dispositivos/${id}/conf`, {
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(res => res.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre + '.conf';
    a.click();
    window.URL.revokeObjectURL(url);
  });
}

async function verQR(id) {
  const res = await fetch(`/api/usuario/dispositivos/${id}/qr`, {
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  const data = await res.json();
  if (res.ok) {
    const ventana = window.open('', '_blank', 'width=350,height=350');
    ventana.document.write(`
      <html><body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#0f1117">
        <img src="${data.qr}" style="width:300px;height:300px">
      </body></html>
    `);
  } else {
    alert('Error al generar el QR');
  }
}
async function cambiarPassword() {
  const actual = document.getElementById('password-actual').value.trim();
  const nueva = document.getElementById('password-nueva').value.trim();
  const confirmar = document.getElementById('password-confirmar').value.trim();
  const errorDiv = document.getElementById('password-error');
  const okDiv = document.getElementById('password-ok');

  errorDiv.textContent = '';
  okDiv.textContent = '';

  if (!actual || !nueva || !confirmar) {
    errorDiv.textContent = 'Todos los campos son obligatorios';
    return;
  }

  if (nueva !== confirmar) {
    errorDiv.textContent = 'Las contraseñas nuevas no coinciden';
    return;
  }

  if (nueva.length < 8) {
    errorDiv.textContent = 'La contrasena debe tener al menos 8 caracteres';
    return;
  }

  if (!/[A-Z]/.test(nueva)) {
    errorDiv.textContent = 'La contrasena debe tener al menos una mayuscula';
    return;
  }

  if (!/[a-z]/.test(nueva)) {
    errorDiv.textContent = 'La contrasena debe tener al menos una minuscula';
    return;
  }

  if (!/[0-9]/.test(nueva)) {
    errorDiv.textContent = 'La contrasena debe tener al menos un numero';
    return;
  }

  if (!/[^A-Za-z0-9]/.test(nueva)) {
    errorDiv.textContent = 'La contrasena debe tener al menos un simbolo';
    return;
  }

  const res = await fetch('/api/usuario/password', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    },
    body: JSON.stringify({ password_actual: actual, password_nueva: nueva })
  });

  const data = await res.json();

  if (!res.ok) {
    errorDiv.textContent = data.error;
    return;
  }

  okDiv.textContent = 'Contraseña cambiada correctamente';
  document.getElementById('password-actual').value = '';
  document.getElementById('password-nueva').value = '';
  document.getElementById('password-confirmar').value = '';
}