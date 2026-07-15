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

  // Cierra sesión (msal-auth.js puede extender esto para cerrar sesión de Microsoft)
  logout() {
    this._currentUser = null;
    sessionStorage.removeItem('gestion_session');
    // Si MSAL está disponible, lo maneja msal-auth.js con un override
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

// ── Funciones del sidebar/topbar de usuario ───────────────────
if (document.readyState !== 'loading') {
  _initPageAuth();
} else {
  document.addEventListener('DOMContentLoaded', _initPageAuth);
}

function _initPageAuth() {
  // Botón de cerrar sesión en sidebar
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => Auth.logout());
  }
}
