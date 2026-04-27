// Comprobar si ya hay sesion activa al cargar login
if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
  const token = localStorage.getItem('token');
  const rol = localStorage.getItem('rol');
  if (token) {
    if (rol === 'admin') window.location.href = '/admin.html';
    else window.location.href = '/usuario.html';
  }
}

async function hacerLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const errorDiv = document.getElementById('error');

  if (!username || !password) {
    errorDiv.textContent = 'Usuario y contrasena obligatorios';
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      errorDiv.textContent = data.error || 'Error al iniciar sesion';
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('rol', data.usuario.rol);
    localStorage.setItem('username', data.usuario.username);
    localStorage.setItem('userId', data.usuario.id);

    if (data.usuario.rol === 'admin') {
      window.location.href = '/admin.html';
    } else {
      window.location.href = '/usuario.html';
    }

  } catch (error) {
    errorDiv.textContent = 'Error de conexion';
  }
}

function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('rol');
  localStorage.removeItem('username');
  localStorage.removeItem('userId');
  window.location.href = '/';
}

function getToken() {
  return localStorage.getItem('token');
}

function getRol() {
  return localStorage.getItem('rol');
}

function getUsername() {
  return localStorage.getItem('username');
}

function verificarSesion(rolRequerido) {
  const token = localStorage.getItem('token');
  const rol = localStorage.getItem('rol');

  if (!token) {
    window.location.href = '/';
    return false;
  }

  if (rolRequerido && rol !== rolRequerido) {
    window.location.href = '/';
    return false;
  }

  return true;
}