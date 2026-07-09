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
  measurementId:     "G-RNCV96476M"
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
const ESTADOS_SERVICIO = [
  { id: "pendiente",   label: "Pendiente",  badge: "badge-pending",   emoji: "⏳" },
  { id: "en_proceso",  label: "En Proceso", badge: "badge-progress",  emoji: "🔄" },
  { id: "entregado",   label: "Entregado",  badge: "badge-completed", emoji: "✅" },
];
const METODOS_PAGO = [
  { id: 'efectivo',     label: 'Efectivo',            emoji: '💵' },
  { id: 'transferencia',label: 'Transferencia',        emoji: '🏦' },
  { id: 'tarjeta',      label: 'Tarjeta',              emoji: '💳' },
  { id: 'cheque',       label: 'Cheque',               emoji: '📝' },
  { id: 'credito',      label: 'Crédito / Cartera',   emoji: '📊' },
];
const UNIDADES = ["unidades","horas","días","eventos","metros","piezas","personas","kg","m²"];
const ROLES = [
  { id: "admin",        label: "Administrador",  permisos: ["all"] },
  { id: "coordinador",  label: "Coordinador",    permisos: ["read", "write", "status"] },
  { id: "visualizador", label: "Visualizador",   permisos: ["read"] },
];

function getMetodoPago(id) { return METODOS_PAGO.find(m => m.id === id) || { label: id, emoji: '💰' }; }

// ── FireSync: Sincronización bidireccional localStorage ↔ Firestore ──
const FireSync = {
  db: null,
  _ready: false,
  _unsubscribers: [],
  _syncing: false,

  // Mapeo: clave localStorage → colección Firestore
  COLLECTIONS: {
    solicitudes:    'solicitudes',
    users:          'usuarios',
    notificaciones: 'notificaciones',
    bot_users:      'bot_users',
  },

  async init() {
    try {
      if (typeof firebase === 'undefined') {
        console.warn('⚠️ Firebase SDK no disponible — modo solo localStorage');
        return false;
      }
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      this.db = firebase.firestore();
      this._ready = true;

      // Cargar datos iniciales desde Firestore
      await this._loadAll();

      // Escuchar cambios en tiempo real (bot → web)
      this._startListeners();

      console.log('🔥 FireSync conectado a botfather-8b715');
      return true;
    } catch(e) {
      console.warn('⚠️ FireSync error:', e.message);
      return false;
    }
  },

  // Cargar todas las colecciones desde Firestore al iniciar
  async _loadAll() {
    for (const [storeKey, collection] of Object.entries(this.COLLECTIONS)) {
      try {
        const snap = await this.db.collection(collection).get();
        if (!snap.empty) {
          const data = snap.docs.map(d => d.data());
          localStorage.setItem('gestion_' + storeKey, JSON.stringify(data));
        }
      } catch(e) {
        console.warn(`FireSync: no se pudo cargar ${collection}:`, e.message);
      }
    }
    // Cargar áreas (guardadas como documento)
    try {
      const areaDoc = await this.db.collection('config').doc('areas').get();
      if (areaDoc.exists) {
        const lista = areaDoc.data().lista;
        if (lista && lista.length) {
          localStorage.setItem('gestion_areas', JSON.stringify(lista));
        }
      }
    } catch(e) {}
  },

  // Listener en tiempo real sobre solicitudes (bot crea → web se actualiza)
  _startListeners() {
    if (!this.db) return;

    // Escuchar solicitudes en tiempo real
    const unsubSolicitudes = this.db.collection('solicitudes')
      .onSnapshot(snap => {
        if (this._syncing) return; // Evitar loop
        const data = snap.docs.map(d => d.data());
        localStorage.setItem('gestion_solicitudes', JSON.stringify(data));
        // Notificar a la UI si está escuchando
        if (typeof AppState !== 'undefined') {
          AppState.solicitudes = data;
          AppState._emit('solicitudes', data);
        }
        // Actualizar badge de notificaciones
        if (typeof updateNotifBadge === 'function') updateNotifBadge();
        // Si es una solicitud nueva del bot, mostrar toast
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const sol = change.doc.data();
            if (sol.creadoViaTelegram && sol.createdAt) {
              const age = Date.now() - new Date(sol.createdAt).getTime();
              if (age < 30000) { // Solo si es muy reciente (< 30 seg)
                if (typeof Toast !== 'undefined') {
                  Toast.success(`🤖 Nueva solicitud desde Telegram: ${sol.titulo}`);
                }
              }
            }
          }
        });
      }, err => console.warn('FireSync listener error:', err.message));

    // Escuchar notificaciones en tiempo real
    const unsubNotifs = this.db.collection('notificaciones')
      .where('leida', '==', false)
      .onSnapshot(snap => {
        if (this._syncing) return;
        const todas = JSON.parse(localStorage.getItem('gestion_notificaciones') || '[]');
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const notif = change.doc.data();
            const existe = todas.find(n => n.id === notif.id);
            if (!existe) todas.unshift(notif);
          }
        });
        localStorage.setItem('gestion_notificaciones', JSON.stringify(todas));
        if (typeof updateNotifBadge === 'function') updateNotifBadge();
      }, () => {});

    this._unsubscribers.push(unsubSolicitudes, unsubNotifs);
  },

  // Escribir en Firestore cuando Store.set() es llamado
  async syncWrite(storeKey, data) {
    if (!this._ready || !this.db) return;
    const collection = this.COLLECTIONS[storeKey];
    if (!collection) {
      // Manejar áreas como documento especial
      if (storeKey === 'areas') {
        try {
          await this.db.collection('config').doc('areas').set({ lista: data });
        } catch(e) { console.warn('FireSync areas write error:', e.message); }
      }
      return;
    }
    if (!Array.isArray(data)) return;
    this._syncing = true;
    try {
      const batch = this.db.batch();
      data.forEach(item => {
        if (item && item.id) {
          const ref = this.db.collection(collection).doc(String(item.id));
          batch.set(ref, item, { merge: true });
        }
      });
      await batch.commit();
    } catch(e) {
      console.warn(`FireSync write error (${collection}):`, e.message);
    } finally {
      this._syncing = false;
    }
  },

  // Eliminar un documento de Firestore
  async syncDelete(storeKey, id) {
    if (!this._ready || !this.db) return;
    const collection = this.COLLECTIONS[storeKey];
    if (!collection || !id) return;
    try {
      await this.db.collection(collection).doc(String(id)).delete();
    } catch(e) { console.warn(`FireSync delete error:`, e.message); }
  },
};
