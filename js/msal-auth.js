// ============================================================
// MSAL-AUTH.JS — Autenticación con Microsoft 365 (Azure AD)
// ============================================================
'use strict';

const MSAL_CONFIG = {
  auth: {
    clientId:    '0ee24af8-7c67-4ce8-afd0-5853be7c5149',
    authority:   'https://login.microsoftonline.com/40358350-8aa0-4517-adb0-cda39497c0ba',
    redirectUri: 'https://dibervega.github.io/gestion-deportiva/',
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

const LOGIN_SCOPES = { scopes: ['User.Read'] };

let _msalInstance = null;

// ── Inicializar MSAL ──────────────────────────────────────────
function getMsalInstance() {
  if (!_msalInstance) {
    if (typeof msal === 'undefined') {
      console.error('MSAL.js no está cargado');
      return null;
    }
    _msalInstance = new msal.PublicClientApplication(MSAL_CONFIG);
  }
  return _msalInstance;
}

// ── Login con redirect a Microsoft ───────────────────────────
async function loginConMicrosoft() {
  const client = getMsalInstance();
  if (!client) return;
  try {
    await client.loginRedirect(LOGIN_SCOPES);
  } catch (e) {
    console.error('loginRedirect error:', e);
    Toast.error('No se pudo conectar con Microsoft. Intenta de nuevo.');
  }
}

// ── Manejar el redirect de vuelta desde Microsoft ─────────────
// Llamar esta función al cargar la página de login
async function handleMsalRedirect() {
  const client = getMsalInstance();
  if (!client) return null;

  try {
    const response = await client.handleRedirectPromise();
    if (response) {
      // El usuario acaba de volver de Microsoft con un token válido
      return await _processMsalResponse(response);
    }

    // Verificar si ya hay cuenta activa en sesión
    const accounts = client.getAllAccounts();
    if (accounts.length > 0) {
      // Ya tenía sesión de Microsoft, obtener token silencioso
      const tokenResponse = await client.acquireTokenSilent({
        ...LOGIN_SCOPES,
        account: accounts[0],
      });
      return await _processMsalResponse(tokenResponse);
    }
  } catch (e) {
    console.warn('handleMsalRedirect error:', e.message);
  }
  return null;
}

// ── Procesar la respuesta de Microsoft y crear sesión local ───
async function _processMsalResponse(response) {
  const msEmail = (response.account?.username || '').toLowerCase().trim();
  if (!msEmail) throw new Error('No se pudo obtener el correo de Microsoft.');

  // Esperar a que Firebase cargue los usuarios
  if (typeof FireSync !== 'undefined') {
    await FireSync.waitForUsers(7000);
  }

  // Buscar el usuario en nuestra base de datos por email
  const users = (typeof Store !== 'undefined' ? Store.get('users') : null) || [];
  const user = users.find(u => u.email.toLowerCase() === msEmail && u.activo);

  if (!user) {
    // No está registrado en el sistema — cerrar sesión de Microsoft también
    _logoutMsal();
    throw new Error(
      `La cuenta "${msEmail}" no tiene acceso al sistema.\n` +
      `Contacta al administrador para que te registre.`
    );
  }

  // Crear sesión local igual que antes
  if (typeof Auth !== 'undefined') {
    Auth._currentUser = user;
    sessionStorage.setItem('gestion_session', JSON.stringify(user));
  }

  return user;
}

// ── Cerrar sesión de Microsoft ────────────────────────────────
function _logoutMsal() {
  const client = getMsalInstance();
  if (!client) return;
  const accounts = client.getAllAccounts();
  if (accounts.length > 0) {
    client.logoutRedirect({
      account: accounts[0],
      postLogoutRedirectUri: 'https://dibervega.github.io/gestion-deportiva/',
    });
  }
}

// Extender Auth.logout para cerrar sesión también en Microsoft
if (typeof Auth !== 'undefined') {
  const _originalLogout = Auth.logout.bind(Auth);
  Auth.logout = function () {
    sessionStorage.removeItem('gestion_session');
    Auth._currentUser = null;
    _logoutMsal(); // Redirige → cierra sesión Microsoft → vuelve a index.html
  };
}
