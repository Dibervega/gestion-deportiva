// ============================================================
// AUTH.JS — Autenticación y Gestión de Sesión
// ============================================================

'use strict';

const Auth = {
  // Usuario actual en sesión
  _currentUser: null,

  // Obtiene el usuario de sesión
  getCurrentUser() {
    if (this._currentUser) return this._currentUser;
    const u = sessionStorage.getItem('gestion_session');
    if (u) { this._currentUser = JSON.parse(u); return this._currentUser; }
    return null;
  },

  // Inicia sesión demo (sin Firebase)
  async loginDemo(email, password) {
    const users = Store.get('users') || [];
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.activo);
    if (!user) throw new Error('Usuario no encontrado o inactivo');

    // En modo demo, cualquier contraseña funciona para los usuarios precargados
    // En producción con Firebase Auth se validaría contra Firebase
    if (!['gestion123', 'admin123', '123456'].includes(password) &&
        password !== user.email.split('@')[0]) {
      throw new Error('Contraseña incorrecta');
    }

    this._currentUser = user;
    sessionStorage.setItem('gestion_session', JSON.stringify(user));
    return user;
  },

  // Cierra sesión
  logout() {
    this._currentUser = null;
    sessionStorage.removeItem('gestion_session');
    window.location.href = 'index.html';
  },

  // Verifica si tiene permiso
  can(action) {
    const user = this.getCurrentUser();
    if (!user) return false;
    if (user.rol === 'admin') return true;
    const role = ROLES.find(r => r.id === user.rol);
    if (!role) return false;
    if (role.permisos.includes('all')) return true;
    return role.permisos.includes(action);
  },

  // Redirige si no está autenticado
  requireAuth() {
    if (!this.getCurrentUser()) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  },

  // Redirige si ya está autenticado (para la página de login)
  redirectIfAuth() {
    if (this.getCurrentUser()) {
      window.location.href = 'dashboard.html';
      return true;
    }
    return false;
  },
};

// ── Página de Login ──────────────────────────────────────────
function initLoginPage() {
  Auth.redirectIfAuth();

  const form     = document.getElementById('login-form');
  const emailIn  = document.getElementById('login-email');
  const passIn   = document.getElementById('login-password');
  const btn      = document.getElementById('login-btn');
  const errMsg   = document.getElementById('login-error');
  const passToggle = document.getElementById('pass-toggle');

  if (!form) return;

  // Toggle visibilidad contraseña
  passToggle?.addEventListener('click', () => {
    const isPass = passIn.type === 'password';
    passIn.type = isPass ? 'text' : 'password';
    passToggle.textContent = isPass ? '🙈' : '👁️';
  });

  // Hints de demo
  const hints = [
    { email: 'admin@empresa.com',        pass: 'admin123',    label: '👑 Admin' },
    { email: 'cronometraje@empresa.com', pass: 'cronometraje', label: '⏱️ Cronometraje' },
    { email: 'medalleria@empresa.com',   pass: 'medalleria',   label: '🏅 Medallería' },
  ];

  document.querySelectorAll('.demo-hint').forEach((el, i) => {
    if (hints[i]) {
      el.addEventListener('click', () => {
        emailIn.value = hints[i].email;
        passIn.value  = hints[i].pass;
        emailIn.dispatchEvent(new Event('input'));
      });
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errMsg.textContent = '';

    const email    = emailIn.value.trim();
    const password = passIn.value;

    if (!email || !password) {
      errMsg.textContent = 'Por favor completa todos los campos.';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Ingresando...';

    try {
      await Auth.loginDemo(email, password);
      btn.innerHTML = '✅ ¡Bienvenido!';
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);
    } catch(err) {
      errMsg.textContent = err.message;
      btn.disabled = false;
      btn.innerHTML = 'Iniciar Sesión';
      passIn.value = '';
      passIn.focus();
    }
  });

  hideLoader();
}

// ── Init en Login Page ───────────────────────────────────────
if (document.getElementById('login-form')) {
  document.addEventListener('DOMContentLoaded', initLoginPage);
}
