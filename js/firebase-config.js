// ============================================================
// FIREBASE CONFIG — Proyecto botfather-8b715
// ============================================================
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyD9MAPwdlc1H_25aR4VRFEyOScMD4fxEY0",
  authDomain:        "botfather-8b715.firebaseapp.com",
  projectId:         "botfather-8b715",
  storageBucket:     "botfather-8b715.firebasestorage.app",
  messagingSenderId: "83288241294",
  appId:             "1:83288241294:web:c7add6d919af7b985605df",
  measurementId:     "G-RNCV96476M",
  databaseURL:       "https://botfather-8b715-default-rtdb.firebaseio.com"
};

const EMAILJS_CONFIG = {
  serviceId:  "service_XXXXXXX",
  templateId: "template_XXXXXXX",
  publicKey:  "TU_PUBLIC_KEY",
};

const EMPRESA_CONFIG = {
  nombre:   "Gestión Deportiva",
  logo:     "🏆",
  moneda:   "COP",
  zonaHora: "America/Bogota",
  idioma:   "es-CO",
};

// ── Áreas por defecto ────────────────────────────────────────────
const AREAS_DEFAULT = [
  { id: "cronometraje",   nombre: "Cronometraje",    emoji: "⏱️", color: "#5865f2", activo: true },
  { id: "medalleria",     nombre: "Medallería",       emoji: "🏅", color: "#f59e0b", activo: true },
  { id: "administrativa", nombre: "Administrativa",   emoji: "🏢", color: "#10b981", activo: true },
  { id: "diseno",         nombre: "Diseño",           emoji: "🎨", color: "#8b5cf6", activo: true },
  { id: "fotografia",     nombre: "Fotografía",       emoji: "📷", color: "#00d4ff", activo: true },
  { id: "permisos",       nombre: "Permisos",         emoji: "📋", color: "#f43f5e", activo: true },
  { id: "logistica",      nombre: "Logística",        emoji: "🚚", color: "#06b6d4", activo: true },
  { id: "comercial",      nombre: "Comercial",        emoji: "💼", color: "#84cc16", activo: true },
];

function getAreas() {
  if (typeof Store !== 'undefined') {
    const stored = Store.get('areas');
    if (stored && stored.length) return stored;
  }
  return AREAS_DEFAULT;
}

// ── Constantes de estados y catálogos ───────────────────────────
const ESTADOS = [
  { id: "pendiente",  label: "Pendiente",   badge: "badge-pending",   emoji: "⏳" },
  { id: "en_proceso", label: "En Proceso",  badge: "badge-progress",  emoji: "🔄" },
  { id: "revision",   label: "En Revisión", badge: "badge-review",    emoji: "👁️" },
  { id: "aprobado",   label: "Aprobado",    badge: "badge-approved",  emoji: "✅" },
  { id: "completado", label: "Completado",  badge: "badge-completed", emoji: "🎯" },
  { id: "cancelado",  label: "Cancelado",   badge: "badge-cancelled", emoji: "❌" },
];
const PRIORIDADES = [
  { id: "alta",  label: "Alta",  badge: "badge-high",   emoji: "🔴" },
  { id: "media", label: "Media", badge: "badge-medium", emoji: "🟡" },
  { id: "baja",  label: "Baja",  badge: "badge-low",    emoji: "🟢" },
];
const CATEGORIAS_GASTO = [
  { id: "materiales",  label: "Materiales",      color: "#5865f2", dot: "cat-materiales" },
  { id: "transporte",  label: "Transporte",       color: "#10b981", dot: "cat-transporte" },
  { id: "personal",    label: "Personal",         color: "#f59e0b", dot: "cat-personal"   },
  { id: "equipos",     label: "Equipos/Alquiler", color: "#8b5cf6", dot: "cat-equipos"    },
  { id: "admin",       label: "Administrativo",   color: "#00d4ff", dot: "cat-admin"      },
  { id: "otros",       label: "Otros",            color: "#94a3b8", dot: "cat-otros"      },
];
const ESTADOS_PAGO = [
  { id: "sin_pago", label: "Sin Pago",  badge: "badge-unpaid"  },
  { id: "parcial",  label: "Parcial",   badge: "badge-partial" },
  { id: "pagado",   label: "Pagado",    badge: "badge-paid"    },
  { id: "vencido",  label: "Vencido",   badge: "badge-overdue" },
];
const METODOS_PAGO = [
  { id: "efectivo",     label: "Efectivo",         emoji: "💵" },
  { id: "transferencia",label: "Transferencia",    emoji: "🏦" },
  { id: "tarjeta",      label: "Tarjeta / TPV",    emoji: "💳" },
  { id: "cheque",       label: "Cheque",           emoji: "🧾" },
  { id: "plataforma",   label: "Plataforma (Stripe/PayPal)", emoji: "🌐" },
];
const ESTADOS_SERVICIO = [
  { id: "pendiente",   label: "Pendiente",  badge: "badge-pending",   emoji: "⏳" },
  { id: "en_proceso",  label: "En Proceso", badge: "badge-progress",  emoji: "🔄" },
  { id: "entregado",   label: "Entregado",  badge: "badge-completed", emoji: "✅" },
];
const UNIDADES = ["unidades","horas","días","eventos","metros","piezas","personas","kg","m²"];
const ROLES = [
  { id: "admin",        label: "Administrador",  permisos: ["all"] },
  { id: "coordinador",  label: "Coordinador",    permisos: ["read", "write", "status"] },
  { id: "visualizador", label: "Visualizador",   permisos: ["read"] },
];

// -- FireSync: Sincronizacion localStorage <-> Realtime Database (GRATUITO) --
const FireSync = {
  db: null,
  _ready: false,

  PATHS: {
    solicitudes:    'solicitudes',
    notificaciones: 'notificaciones',
    usuarios:       'usuarios',
    bot_users:      'bot_users',
  },

  async init() {
    try {
      if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK no disponible');
        return false;
      }
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      this.db = firebase.database();
      this._ready = true;
      await this._loadAll();
      this._startListeners();
      console.log('Firebase conectado a botfather-8b715 (Realtime Database)');
      return true;
    } catch(e) {
      console.warn('FireSync error:', e.message);
      return false;
    }
  },

  async _loadAll() {
    for (const [storeKey, path] of Object.entries(this.PATHS)) {
      try {
        const snap = await this.db.ref(path).get();
        if (snap.exists()) {
          const val = snap.val();
          const data = val ? (Array.isArray(val) ? val : Object.values(val)).filter(Boolean) : [];
          if (data.length) localStorage.setItem('gestion_' + storeKey, JSON.stringify(data));
        }
      } catch(e) {
        console.warn('FireSync: no se pudo cargar ' + path + ':', e.message);
      }
    }
  },

  _startListeners() {
    if (!this.db) return;
    const solRef = this.db.ref('solicitudes');

    solRef.on('value', snap => {
      const val = snap.val();
      const data = val ? (Array.isArray(val) ? val : Object.values(val)).filter(Boolean) : [];
      localStorage.setItem('gestion_solicitudes', JSON.stringify(data));
      if (typeof AppState !== 'undefined') { AppState.solicitudes = data; AppState._emit('solicitudes', data); }
      if (typeof updateNotifBadge === 'function') updateNotifBadge();
    });

    solRef.on('child_added', snap => {
      const sol = snap.val();
      if (!sol) return;
      if (sol.creadoViaTelegram && sol.createdAt) {
        const age = Date.now() - new Date(sol.createdAt).getTime();
        if (age < 30000 && typeof Toast !== 'undefined') {
          Toast.success('Nueva solicitud desde Telegram: ' + (sol.titulo || sol.cliente || ''));
        }
      }
    });

    this.db.ref('notificaciones').on('child_added', snap => {
      const notif = snap.val();
      if (!notif) return;
      const todas = JSON.parse(localStorage.getItem('gestion_notificaciones') || '[]');
      if (!todas.find(n => n.id === notif.id)) {
        todas.unshift(notif);
        localStorage.setItem('gestion_notificaciones', JSON.stringify(todas));
        if (typeof updateNotifBadge === 'function') updateNotifBadge();
      }
    });
  },

  async syncWrite(storeKey, data) {
    if (!this._ready || !this.db || !Array.isArray(data)) return;
    const path = this.PATHS[storeKey];
    if (!path) return;
    try {
      const obj = {};
      data.forEach(item => { if (item && item.id) obj[item.id] = item; });
      await this.db.ref(path).set(obj);
    } catch(e) { console.warn('FireSync write error:', e.message); }
  },

  async syncDelete(storeKey, id) {
    if (!this._ready || !this.db) return;
    const path = this.PATHS[storeKey];
    if (!path || !id) return;
    try { await this.db.ref(path + '/' + id).remove(); }
    catch(e) { console.warn('FireSync delete error:', e.message); }
  },
};
