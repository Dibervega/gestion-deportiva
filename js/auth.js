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

  // Inicia sesión local
  async loginDemo(email, password) {
    const users = Store.get('users') || [];
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.activo);
    if (!user) throw new Error('Usuario no encontrado o inactivo');

    // Validación estricta de la contraseña almacenada
    // Si por alguna razón no tiene clave (usuarios antiguos de Firebase), se intenta 123456
    // Y si es el admin, su clave por defecto es admin123
    let validPassword = user.password;
    if (!validPassword) {
      validPassword = user.email === 'admin@gestion.com' ? 'admin123' : '123456';
      if (user.email !== 'admin@gestion.com') {
        user.requirePasswordChange = true;
      }
    }
    
    if (password !== validPassword) {
      throw new Error('Contraseña incorrecta');
    }

    this._currentUser = user;
    sessionStorage.setItem('gestion_session', JSON.stringify(user));
    return user;
  },

  // Cambiar contraseña obligatoria
  async changePassword(newPassword) {
    const u = this.getCurrentUser();
    if (!u) throw new Error('No hay sesión activa');
    
    const users = Store.get('users') || [];
    const idx = users.findIndex(us => us.id === u.id);
    if (idx >= 0) {
      users[idx].password = newPassword;
      users[idx].requirePasswordChange = false;
      Store.set('users', users);
      
      // Actualizar sesión actual
      this._currentUser = users[idx];
      sessionStorage.setItem('gestion_session', JSON.stringify(users[idx]));
    }
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
    btn.innerHTML = '<span class="spinner"></span> Verificando conexión...';

    // ⚠️ Esperar a que Firebase cargue los usuarios antes de validar
    if (typeof FireSync !== 'undefined') {
      await FireSync.waitForUsers(6000);
    }

    btn.innerHTML = '<span class="spinner"></span> Ingresando...';

    try {
      const user = await Auth.loginDemo(email, password);
      
      if (user.requirePasswordChange) {
        btn.innerHTML = '🔒 Requiere cambio de clave';
        showPasswordChangeModal(user);
        return;
      }
      
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

function showPasswordChangeModal(user) {
  // Utilizamos la utilidad Modal asumiendo que Modal.open existe en shared.js (sí existe)
  const { modal, close } = Modal.open(`
    <div class="modal-header"><div class="modal-title">🔒 Cambio Obligatorio de Contraseña</div></div>
    <div class="modal-body">
      <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-4)">
        Hola <b>${escHtml(user.nombre)}</b>, por seguridad debes cambiar la contraseña que te asignó el administrador antes de poder acceder al sistema.
      </p>
      <div class="form-group"><label class="form-label">Nueva Contraseña</label>
        <input class="form-control" type="password" id="cp-new" placeholder="Escribe tu nueva clave secreta" />
      </div>
      <div class="form-group"><label class="form-label">Confirmar Contraseña</label>
        <input class="form-control" type="password" id="cp-confirm" placeholder="Vuelve a escribirla" />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" id="btn-save-pass" style="width:100%">Guardar y Entrar</button>
    </div>
  `, { closeable: false }); // No se puede cerrar sin cambiarla

  modal.querySelector('#btn-save-pass').addEventListener('click', async () => {
    const newPass = modal.querySelector('#cp-new').value;
    const confirm = modal.querySelector('#cp-confirm').value;
    
    if (!newPass) { Toast.warning('Debes escribir una contraseña'); return; }
    if (newPass.length < 6) { Toast.warning('La contraseña debe tener mínimo 6 caracteres'); return; }
    if (newPass !== confirm) { Toast.warning('Las contraseñas no coinciden'); return; }
    
    const btn = modal.querySelector('#btn-save-pass');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    
    try {
      await Auth.changePassword(newPass);
      btn.textContent = '✅ ¡Guardado!';
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);
    } catch (e) {
      Toast.error('Hubo un error guardando la clave');
      btn.disabled = false;
      btn.textContent = 'Guardar y Entrar';
    }
  });
}

// ── Init en Login Page ───────────────────────────────────────
if (document.getElementById('login-form')) {
  document.addEventListener('DOMContentLoaded', initLoginPage);
}
