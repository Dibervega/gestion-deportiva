// ============================================================
// APP.JS — Utilidades Globales, Estado, Router, Helpers
// ============================================================
'use strict';

const AppState = {
  user: null, userProfile: null, notifCount: 0,
  notifPanelOpen: false, currentPage: null,
  solicitudes: [], users: [], _listeners: {},
  set(key, val) { this[key] = val; this._emit(key, val); },
  _emit(key, val) { (this._listeners[key] || []).forEach(fn => fn(val)); },
  on(key, fn) { if (!this._listeners[key]) this._listeners[key] = []; this._listeners[key].push(fn); },
};

let db, auth;
function initFirebase() {
  try {
    if (typeof firebase === 'undefined') throw new Error('Firebase SDK no cargado');
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore(); auth = firebase.auth();
    return true;
  } catch(e) { console.warn('⚠️ Firebase no disponible, modo demo:', e.message); return false; }
}

// ── Formatters ────────────────────────────────────────────────
const Fmt = {
  currency(amount, compact = false) {
    if (isNaN(amount)) amount = 0;
    const n = parseFloat(amount);
    if (compact && n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`;
    if (compact && n >= 1_000)     return `$${(n/1_000).toFixed(0)}k`;
    return new Intl.NumberFormat(EMPRESA_CONFIG.idioma, {
      style: 'currency', currency: EMPRESA_CONFIG.moneda,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(n);
  },
  date(ts, format = 'short') {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d)) return '—';
    if (format === 'relative') return Fmt.relative(d);
    return d.toLocaleDateString(EMPRESA_CONFIG.idioma, { day: '2-digit', month: 'short', year: 'numeric' });
  },
  relative(date) {
    const d = date?.toDate ? date.toDate() : new Date(date);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'Ahora mismo';
    if (mins < 60) return `Hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `Hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7)  return `Hace ${days}d`;
    return Fmt.date(d);
  },
  initials: (name = '') => name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase(),
  percent: (value, total) => !total ? 0 : Math.min(100, Math.round((value / total) * 100)),
};

// ── DOM Helpers ───────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Toast ─────────────────────────────────────────────────────
const Toast = {
  _container: null,
  init() {
    this._container = document.getElementById('toast-container');
    if (!this._container) { this._container = document.createElement('div'); this._container.id = 'toast-container'; document.body.appendChild(this._container); }
  },
  show(msg, type = 'info', duration = 4000) {
    if (!this._container) this.init();
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type]||'📢'}</span><span class="toast-msg">${escHtml(msg)}</span><span class="toast-close" onclick="this.parentElement.remove()">✕</span>`;
    this._container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg)   { this.show(msg, 'error'); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg)    { this.show(msg, 'info'); },
};

// ── Modal ─────────────────────────────────────────────────────
const Modal = {
  _stack: [],
  open(contentHtml, { size = '', onClose } = {}) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = `modal ${size ? 'modal-' + size : ''}`;
    modal.innerHTML = contentHtml;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';
    backdrop.addEventListener('click', e => { if (e.target === backdrop) this.close(backdrop, onClose); });
    modal.querySelector('[data-modal-close]')?.addEventListener('click', () => this.close(backdrop, onClose));
    this._stack.push(backdrop);
    return { backdrop, modal, close: () => this.close(backdrop, onClose) };
  },
  close(backdrop, onClose) {
    backdrop?.remove();
    this._stack = this._stack.filter(b => b !== backdrop);
    if (!this._stack.length) document.body.style.overflow = '';
    onClose?.();
  },
  closeAll() { this._stack.forEach(b => b.remove()); this._stack = []; document.body.style.overflow = ''; },
};

// ── ID Generator ──────────────────────────────────────────────
function generateTicketId(prefix = 'SOL') {
  const year = new Date().getFullYear();
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}-${year}-${rand}`;
}
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7).toUpperCase();
}

// ── Store — localStorage + sincronización Firebase ─────────────────
const Store = {
  _prefix: 'gestion_',
  get(key) {
    try { return JSON.parse(localStorage.getItem(this._prefix + key)); }
    catch { return null; }
  },
  set(key, val) {
    localStorage.setItem(this._prefix + key, JSON.stringify(val));
    // Sincronizar con Firestore en segundo plano (sin bloquear UI)
    if (typeof FireSync !== 'undefined' && FireSync._ready) {
      FireSync.syncWrite(key, val).catch(() => {});
    }
  },
  push(key, item) {
    const arr = this.get(key) || [];
    arr.push(item);
    this.set(key, arr);
    return arr;
  },
  update(key, id, updates) {
    const arr = this.get(key) || [];
    const idx = arr.findIndex(i => i.id === id);
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...updates }; this.set(key, arr); }
    return arr;
  },
  delete(key, id) {
    const arr = (this.get(key) || []).filter(i => i.id !== id);
    this.set(key, arr);
    // Eliminar de Firestore
    if (typeof FireSync !== 'undefined' && FireSync._ready) {
      FireSync.syncDelete(key, id).catch(() => {});
    }
    return arr;
  },
};

// ── Demo Data ─────────────────────────────────────────────────
function initDemoData() {
  if (Store.get('initialized')) return;

  // Inicializar áreas por defecto
  Store.set('areas', AREAS_DEFAULT);

  const demoUsers = [
    { id: 'admin1', nombre: 'Admin Sistema', email: 'admin@empresa.com', rol: 'admin', areas: [], activo: true },
    { id: 'user1',  nombre: 'Carlos Ruiz',   email: 'cronometraje@empresa.com', rol: 'coordinador', areas: ['cronometraje'], activo: true },
    { id: 'user2',  nombre: 'Ana Gómez',     email: 'medalleria@empresa.com',   rol: 'coordinador', areas: ['medalleria'],   activo: true },
    { id: 'user3',  nombre: 'Luis Torres',   email: 'diseno@empresa.com',       rol: 'coordinador', areas: ['diseno'],       activo: true },
    { id: 'user4',  nombre: 'María Soto',    email: 'fotografia@empresa.com',   rol: 'coordinador', areas: ['fotografia'],   activo: true },
  ];
  Store.set('users', demoUsers);

  const ahora = new Date();
  const hace3 = new Date(ahora - 3 * 86400000);
  const hace7 = new Date(ahora - 7 * 86400000);
  const hace1 = new Date(ahora - 86400000);
  const hace5 = new Date(ahora - 5 * 86400000);
  const en2   = new Date(ahora.getTime() + 2  * 86400000);
  const en5   = new Date(ahora.getTime() + 5  * 86400000);
  const en7   = new Date(ahora.getTime() + 7  * 86400000);
  const en10  = new Date(ahora.getTime() + 10 * 86400000);
  const en21  = new Date(ahora.getTime() + 21 * 86400000);

  const solicitudes = [
    {
      id: generateId(), ticketId: 'SOL-2026-0042',
      titulo: 'Maratón Ciudad Norte 2026',
      cliente: 'Alcaldía Municipal',
      areas: ['cronometraje', 'fotografia', 'permisos'],
      estado: 'en_proceso', prioridad: 'alta',
      descripcion: 'Servicio completo para maratón con 2000 participantes. Incluye cronometraje, cobertura fotográfica y permisos municipales.',
      fechaEvento: en7.toISOString().split('T')[0],
      asignadoA: 'user1', creadoPor: 'admin1', contacto: 'eventos@alcaldia.gov',
      createdAt: hace3.toISOString(), updatedAt: hace1.toISOString(),
      historial: [
        { estado: 'pendiente',  fecha: hace3.toISOString(), usuario: 'admin1', nota: 'Solicitud creada' },
        { estado: 'en_proceso', fecha: hace1.toISOString(), usuario: 'user1',  nota: 'Asignado y en preparación' },
      ],
      servicios: [
        { id: generateId(), area: 'cronometraje', nombre: 'Chip timing para corredores', descripcion: 'Sistema de cronometraje con chip para cada participante', cantidad: 2000, unidad: 'unidades', precioUnitario: 2250, precioTotal: 4500000, fechaEntrega: en7.toISOString().split('T')[0], responsable: 'user1', estado: 'en_proceso', notas: 'Incluye chip retornable' },
        { id: generateId(), area: 'cronometraje', nombre: 'Pantallas de resultados en vivo', descripcion: 'Pantallas LED para mostrar resultados en tiempo real', cantidad: 4, unidad: 'unidades', precioUnitario: 150000, precioTotal: 600000, fechaEntrega: en7.toISOString().split('T')[0], responsable: 'user1', estado: 'pendiente', notas: '' },
        { id: generateId(), area: 'fotografia',   nombre: 'Cobertura fotográfica evento completo', descripcion: '3 fotógrafos durante todo el evento', cantidad: 3, unidad: 'personas', precioUnitario: 300000, precioTotal: 900000, fechaEntrega: en7.toISOString().split('T')[0], responsable: 'user4', estado: 'pendiente', notas: 'Entrega de galería en 48h' },
        { id: generateId(), area: 'permisos',     nombre: 'Permiso municipal vía pública', descripcion: 'Gestión de permiso para cierre vial', cantidad: 1, unidad: 'eventos', precioUnitario: 250000, precioTotal: 250000, fechaEntrega: en5.toISOString().split('T')[0], responsable: 'admin1', estado: 'en_proceso', notas: 'En trámite Secretaría de Movilidad' },
      ],
      financiero: {
        valorCotizado: 6250000, anticipo: 3000000, estadoPago: 'parcial',
        gastos: [
          { id: generateId(), categoria: 'equipos',    descripcion: 'Chips de cronometraje', monto: 800000, fecha: hace1.toISOString() },
          { id: generateId(), categoria: 'transporte', descripcion: 'Traslado de equipos',   monto: 150000, fecha: hace1.toISOString() },
        ],
        comisiones: [{ id: generateId(), usuarioId: 'user1', porcentaje: 5, monto: 312500, concepto: 'Comisión coordinación' }],
      },
    },
    {
      id: generateId(), ticketId: 'SOL-2026-0043',
      titulo: 'Torneo Departamental de Natación',
      cliente: 'Liga de Natación',
      areas: ['medalleria', 'diseno'],
      estado: 'revision', prioridad: 'alta',
      descripcion: 'Medallas y diseño para torneo de natación departamental.',
      fechaEvento: en10.toISOString().split('T')[0],
      asignadoA: 'user2', creadoPor: 'admin1', contacto: 'liga@natacion.co',
      createdAt: hace7.toISOString(), updatedAt: hace3.toISOString(),
      historial: [
        { estado: 'pendiente',  fecha: hace7.toISOString(), usuario: 'admin1', nota: 'Solicitud creada' },
        { estado: 'en_proceso', fecha: hace5.toISOString(), usuario: 'user2',  nota: 'Iniciada producción' },
        { estado: 'revision',   fecha: hace3.toISOString(), usuario: 'user2',  nota: 'Enviado para aprobación de diseño' },
      ],
      servicios: [
        { id: generateId(), area: 'medalleria', nombre: 'Medallas doradas categoría absoluta', descripcion: 'Medalla personalizada con logo liga', cantidad: 50,  unidad: 'unidades', precioUnitario: 8000, precioTotal: 400000, fechaEntrega: en10.toISOString().split('T')[0], responsable: 'user2', estado: 'en_proceso', notas: '' },
        { id: generateId(), area: 'medalleria', nombre: 'Medallas plateadas',                  descripcion: 'Segunda posición todas las categorías',  cantidad: 80,  unidad: 'unidades', precioUnitario: 6000, precioTotal: 480000, fechaEntrega: en10.toISOString().split('T')[0], responsable: 'user2', estado: 'pendiente',  notas: '' },
        { id: generateId(), area: 'medalleria', nombre: 'Medallas bronce',                     descripcion: 'Tercera posición todas las categorías',  cantidad: 120, unidad: 'unidades', precioUnitario: 4500, precioTotal: 540000, fechaEntrega: en10.toISOString().split('T')[0], responsable: 'user2', estado: 'pendiente',  notas: '' },
        { id: generateId(), area: 'diseno',     nombre: 'Diseño de medallas personalizado',    descripcion: 'Arte final para troquelado de medallas',  cantidad: 1,   unidad: 'eventos',  precioUnitario: 380000, precioTotal: 380000, fechaEntrega: en5.toISOString().split('T')[0],  responsable: 'user3', estado: 'entregado',  notas: 'Aprobado por el cliente' },
      ],
      financiero: {
        valorCotizado: 1800000, anticipo: 1800000, estadoPago: 'pagado',
        gastos: [
          { id: generateId(), categoria: 'materiales', descripcion: 'Metal y materiales medallas', monto: 620000, fecha: hace5.toISOString() },
          { id: generateId(), categoria: 'personal',   descripcion: 'Mano de obra taller',         monto: 300000, fecha: hace3.toISOString() },
        ],
        comisiones: [{ id: generateId(), usuarioId: 'user2', porcentaje: 8, monto: 144000, concepto: 'Comisión producción' }],
      },
    },
    {
      id: generateId(), ticketId: 'SOL-2026-0044',
      titulo: 'Campeonato Regional de Fútbol',
      cliente: 'Federación Fútbol Regional',
      areas: ['fotografia', 'cronometraje'],
      estado: 'pendiente', prioridad: 'media',
      descripcion: 'Cobertura fotográfica y cronometraje para campeonato regional.',
      fechaEvento: en21.toISOString().split('T')[0],
      asignadoA: 'user4', creadoPor: 'user4', contacto: 'fed@futbol.co',
      createdAt: hace1.toISOString(), updatedAt: hace1.toISOString(),
      historial: [{ estado: 'pendiente', fecha: hace1.toISOString(), usuario: 'user4', nota: 'Solicitud creada' }],
      servicios: [
        { id: generateId(), area: 'fotografia',   nombre: 'Cobertura fotográfica 8 jornadas', descripcion: '2 fotógrafos por jornada', cantidad: 8,  unidad: 'días',    precioUnitario: 400000, precioTotal: 3200000, fechaEntrega: en21.toISOString().split('T')[0], responsable: 'user4', estado: 'pendiente', notas: '' },
        { id: generateId(), area: 'cronometraje', nombre: 'Marcador electrónico de fútbol',   descripcion: 'Pantalla marcador para el estadio',   cantidad: 1,  unidad: 'eventos', precioUnitario: 800000, precioTotal: 800000,  fechaEntrega: en21.toISOString().split('T')[0], responsable: 'user1', estado: 'pendiente', notas: '' },
      ],
      financiero: {
        valorCotizado: 4000000, anticipo: 0, estadoPago: 'sin_pago',
        gastos: [], comisiones: [],
      },
    },
    {
      id: generateId(), ticketId: 'SOL-2026-0041',
      titulo: 'Juegos Universitarios 2026',
      cliente: 'Universidad Central',
      areas: ['cronometraje', 'medalleria', 'diseno', 'fotografia'],
      estado: 'aprobado', prioridad: 'baja',
      descripcion: 'Paquete completo para juegos universitarios: cronometraje, medallas, diseño visual y fotografía.',
      fechaEvento: new Date(ahora.getTime() + 14 * 86400000).toISOString().split('T')[0],
      asignadoA: 'admin1', creadoPor: 'admin1', contacto: 'deportes@uni.edu.co',
      createdAt: hace7.toISOString(), updatedAt: hace1.toISOString(),
      historial: [
        { estado: 'pendiente',  fecha: hace7.toISOString(), usuario: 'admin1', nota: 'Solicitud creada' },
        { estado: 'en_proceso', fecha: hace5.toISOString(), usuario: 'admin1', nota: 'Trabajo iniciado' },
        { estado: 'revision',   fecha: hace3.toISOString(), usuario: 'admin1', nota: 'En revisión del cliente' },
        { estado: 'aprobado',   fecha: hace1.toISOString(), usuario: 'admin1', nota: 'Aprobado por rector' },
      ],
      servicios: [
        { id: generateId(), area: 'cronometraje', nombre: 'Cronometraje atletismo',      descripcion: 'Pista y campo',       cantidad: 1,   unidad: 'eventos',  precioUnitario: 1200000, precioTotal: 1200000, fechaEntrega: new Date(ahora.getTime()+14*86400000).toISOString().split('T')[0], responsable: 'user1', estado: 'pendiente', notas: '' },
        { id: generateId(), area: 'medalleria',   nombre: 'Medallas juegos completos',   descripcion: 'Todas las disciplinas', cantidad: 300, unidad: 'unidades', precioUnitario: 5000,    precioTotal: 1500000, fechaEntrega: new Date(ahora.getTime()+12*86400000).toISOString().split('T')[0], responsable: 'user2', estado: 'en_proceso', notas: '' },
        { id: generateId(), area: 'diseno',       nombre: 'Identidad visual completa',   descripcion: 'Logo, banners, camisetas', cantidad: 1, unidad: 'eventos', precioUnitario: 2200000, precioTotal: 2200000, fechaEntrega: new Date(ahora.getTime()+10*86400000).toISOString().split('T')[0], responsable: 'user3', estado: 'entregado', notas: 'Aprobado' },
        { id: generateId(), area: 'fotografia',   nombre: 'Fotografía evento completo',  descripcion: '5 días de evento',    cantidad: 5,   unidad: 'días',     precioUnitario: 350000,  precioTotal: 1750000, fechaEntrega: new Date(ahora.getTime()+14*86400000).toISOString().split('T')[0], responsable: 'user4', estado: 'pendiente', notas: '' },
      ],
      financiero: {
        valorCotizado: 6650000, anticipo: 3325000, estadoPago: 'parcial',
        gastos: [
          { id: generateId(), categoria: 'materiales', descripcion: 'Materiales diseño',  monto: 200000, fecha: hace5.toISOString() },
          { id: generateId(), categoria: 'personal',   descripcion: 'Horas diseñador',    monto: 400000, fecha: hace3.toISOString() },
        ],
        comisiones: [],
      },
    },
    {
      id: generateId(), ticketId: 'SOL-2026-0039',
      titulo: 'Ciclovía Navideña',
      cliente: 'Secretaría de Deportes',
      areas: ['permisos', 'administrativa'],
      estado: 'completado', prioridad: 'baja',
      descripcion: 'Gestión de permisos y coordinación administrativa para ciclovía.',
      fechaEvento: hace3.toISOString().split('T')[0],
      asignadoA: 'admin1', creadoPor: 'admin1', contacto: 'dep@secretaria.gov',
      createdAt: hace7.toISOString(), updatedAt: hace1.toISOString(),
      historial: [
        { estado: 'pendiente',  fecha: hace7.toISOString(), usuario: 'admin1', nota: 'Creado' },
        { estado: 'en_proceso', fecha: hace5.toISOString(), usuario: 'admin1', nota: 'Trámites en curso' },
        { estado: 'completado', fecha: hace1.toISOString(), usuario: 'admin1', nota: 'Evento realizado exitosamente' },
      ],
      servicios: [
        { id: generateId(), area: 'permisos',     nombre: 'Permiso cierre vial ciclovía',  descripcion: '', cantidad: 1, unidad: 'eventos', precioUnitario: 120000, precioTotal: 120000, fechaEntrega: hace3.toISOString().split('T')[0], responsable: 'admin1', estado: 'entregado', notas: '' },
        { id: generateId(), area: 'administrativa', nombre: 'Coordinación logística general', descripcion: '', cantidad: 1, unidad: 'eventos', precioUnitario: 330000, precioTotal: 330000, fechaEntrega: hace3.toISOString().split('T')[0], responsable: 'admin1', estado: 'entregado', notas: '' },
      ],
      financiero: {
        valorCotizado: 450000, anticipo: 450000, estadoPago: 'pagado',
        gastos: [{ id: generateId(), categoria: 'admin', descripcion: 'Tasas municipales', monto: 120000, fecha: hace5.toISOString() }],
        comisiones: [],
      },
    },
  ];

  Store.set('solicitudes', solicitudes);

  const notifs = [
    { id: generateId(), tipo: 'nueva_solicitud', titulo: 'Nueva solicitud: Maratón Ciudad Norte', ticketId: 'SOL-2026-0042', leida: false, createdAt: hace1.toISOString() },
    { id: generateId(), tipo: 'cambio_estado',   titulo: 'Torneo Natación pasó a En Revisión',   ticketId: 'SOL-2026-0043', leida: false, createdAt: hace3.toISOString() },
    { id: generateId(), tipo: 'completado',       titulo: 'Ciclovía Navideña completada',         ticketId: 'SOL-2026-0039', leida: true,  createdAt: hace3.toISOString() },
  ];
  Store.set('notificaciones', notifs);
  Store.set('initialized', true);
}

// ── Lookup Helpers ────────────────────────────────────────────
function getArea(id) {
  const areas = getAreas();
  return areas.find(a => a.id === id) || { nombre: id, emoji: '📌', color: '#888', id };
}
function getEstado(id)      { return ESTADOS.find(e => e.id === id) || { label: id, badge: '', emoji: '?' }; }
function getPrioridad(id)   { return PRIORIDADES.find(p => p.id === id) || { label: id, badge: '', emoji: '' }; }
function getEstadoPago(id)  { return ESTADOS_PAGO.find(e => e.id === id) || { label: id, badge: '' }; }
function getEstadoSrv(id)   { return ESTADOS_SERVICIO.find(e => e.id === id) || { label: id, badge: '', emoji: '?' }; }
function getCat(id)         { return CATEGORIAS_GASTO.find(c => c.id === id) || { label: id, dot: '' }; }
function getUserById(id)    { return (Store.get('users') || []).find(u => u.id === id); }
function avatarColor(name = '') {
  const colors = ['#5865f2','#8b5cf6','#10b981','#f59e0b','#f43f5e','#00d4ff','#84cc16','#06b6d4'];
  let hash = 0;
  for (let c of name) hash = (hash << 5) - hash + c.charCodeAt(0);
  return colors[Math.abs(hash) % colors.length];
}

// Render múltiples badges de área
function renderAreaBadges(areas = [], maxShow = 3) {
  if (!areas || !areas.length) return '<span class="badge badge-pending">Sin área</span>';
  const arr = Array.isArray(areas) ? areas : [areas]; // compat con proyectos viejos
  const shown = arr.slice(0, maxShow);
  const rest  = arr.length - maxShow;
  return shown.map(aId => {
    const a = getArea(aId);
    return `<span class="badge badge-area" style="--area-color:${a.color}">${a.emoji} ${a.nombre}</span>`;
  }).join('') + (rest > 0 ? `<span class="badge badge-pending">+${rest}</span>` : '');
}

// Próxima fecha de entrega de servicios de una solicitud
function proximaEntrega(sol) {
  const srvs = (sol.servicios || []).filter(s => s.estado !== 'entregado' && s.fechaEntrega);
  if (!srvs.length) return sol.fechaEvento || null;
  srvs.sort((a, b) => new Date(a.fechaEntrega) - new Date(b.fechaEntrega));
  return srvs[0].fechaEntrega;
}

// Color semáforo para fecha de entrega
function semaforoColor(fechaStr) {
  if (!fechaStr) return { cls: 'semaforo-none', label: 'Sin fecha', emoji: '⚪' };
  const diff = new Date(fechaStr) - new Date();
  const dias = Math.ceil(diff / 86400000);
  if (dias < 0)      return { cls: 'semaforo-rojo',    label: `Vencido (${Math.abs(dias)}d)`, emoji: '🔴', dias };
  if (dias === 0)    return { cls: 'semaforo-rojo',    label: 'Vence hoy',  emoji: '🔴', dias };
  if (dias <= 3)     return { cls: 'semaforo-naranja', label: `${dias}d`,   emoji: '🟠', dias };
  if (dias <= 7)     return { cls: 'semaforo-amarillo',label: `${dias}d`,   emoji: '🟡', dias };
  return              { cls: 'semaforo-verde',   label: `${dias}d`,   emoji: '🟢', dias };
}

// Saber si el usuario actual puede ver datos financieros
function canSeeFinancials() {
  const user = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
  return !user || user.rol === 'admin';
}

// Saber si el usuario puede ver TODOS los proyectos (admin o rol sin restricción de áreas)
function canSeeAllProjects() {
  const user = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
  return !user || user.rol === 'admin';
}

// Obtener las áreas a las que tiene acceso el usuario actual
function getUserAreas() {
  const user = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
  if (!user) return [];
  if (user.rol === 'admin') return typeof getAreas === 'function' ? getAreas().map(a => a.id) : [];
  // Retorna las áreas asignadas al usuario, o vacío si no tiene
  return Array.isArray(user.areas) ? user.areas : [];
}

// ── Sidebar / UI helpers ──────────────────────────────────────
function setActiveNav(page) {
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
}
function hideLoader() {
  const loader = document.getElementById('app-loader');
  if (loader) { loader.classList.add('hidden'); setTimeout(() => loader.remove(), 400); }
}
function navigateTo(url) { window.location.href = url; }

function initSidebarToggle() {
  const toggle  = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!toggle || !sidebar) return;
  toggle.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay?.classList.toggle('show'); });
  overlay?.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
}

function initNotifPanel() {
  const bell  = document.getElementById('notif-bell');
  const panel = document.getElementById('notif-panel');
  if (!bell || !panel) return;
  bell.addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) renderNotifPanel();
  });
  document.addEventListener('click', e => {
    if (!panel.contains(e.target) && !bell.contains(e.target)) panel.classList.add('hidden');
  });
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  const notifs = Store.get('notificaciones') || [];
  const unread = notifs.filter(n => !n.leida).length;
  AppState.notifCount = unread;
  if (badge) { badge.textContent = unread; badge.style.display = unread > 0 ? 'flex' : 'none'; }
}

function renderNotifPanel() {
  const body = document.getElementById('notif-panel-body');
  if (!body) return;
  const notifs = (Store.get('notificaciones') || []).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!notifs.length) {
    body.innerHTML = `<div class="empty-state" style="padding:32px"><div class="empty-state-icon">🔔</div><div class="empty-state-title">Sin notificaciones</div></div>`;
    return;
  }
  const iconos = { nueva_solicitud:'📋', cambio_estado:'🔄', completado:'✅', vencimiento:'⚠️', pago:'💰' };
  body.innerHTML = notifs.map(n => `
    <div class="notif-item ${n.leida ? '' : 'unread'}" onclick="markNotifRead('${n.id}')">
      <div class="notif-icon-wrap">${iconos[n.tipo]||'📢'}</div>
      <div class="notif-text">
        <div class="notif-title">${escHtml(n.titulo)}</div>
        <div class="notif-time">${Fmt.relative(n.createdAt)}</div>
      </div>
    </div>
  `).join('');
  updateNotifBadge();
}

function markNotifRead(id) {
  const notifs = Store.get('notificaciones') || [];
  const idx = notifs.findIndex(n => n.id === id);
  if (idx >= 0) { notifs[idx].leida = true; Store.set('notificaciones', notifs); }
  updateNotifBadge(); renderNotifPanel();
}

function markAllNotifsRead() {
  Store.set('notificaciones', (Store.get('notificaciones') || []).map(n => ({ ...n, leida: true })));
  updateNotifBadge(); renderNotifPanel();
}

function addNotification(tipo, titulo, ticketId = null) {
  Store.push('notificaciones', { id: generateId(), tipo, titulo, ticketId, leida: false, createdAt: new Date().toISOString() });
  updateNotifBadge();
  Toast.info(titulo);
}

function renderSidebarUser(user) {
  const nameEl = document.getElementById('sidebar-user-name');
  const roleEl = document.getElementById('sidebar-user-role');
  const avatEl = document.getElementById('sidebar-avatar');
  if (nameEl) nameEl.textContent = user?.nombre || 'Usuario';
  if (roleEl) roleEl.textContent = ROLES.find(r => r.id === user?.rol)?.label || '';
  if (avatEl) { avatEl.textContent = Fmt.initials(user?.nombre || 'U'); avatEl.style.background = avatarColor(user?.nombre || ''); }
}

function confirmDialog(mensaje, titulo = '¿Confirmar?') {
  return new Promise(resolve => {
    const { modal, close } = Modal.open(`
      <div class="modal-header">
        <div class="modal-title">⚠️ ${escHtml(titulo)}</div>
        <button class="modal-close" data-modal-close>✕</button>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-secondary);font-size:var(--text-sm)">${escHtml(mensaje)}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="confirm-no">Cancelar</button>
        <button class="btn btn-danger" id="confirm-yes">Confirmar</button>
      </div>
    `);
    modal.querySelector('#confirm-yes').addEventListener('click', () => { close(); resolve(true); });
    modal.querySelector('#confirm-no').addEventListener('click',  () => { close(); resolve(false); });
  });
}

// Sidebar nav builder (shared)
function buildSidebarNav(activePage) {
  const nav = document.getElementById('areas-nav');
  if (!nav) return;
  const areas = getAreas().filter(a => a.activo);
  nav.innerHTML = areas.map(a => `
    <a class="nav-item" href="solicitudes.html?area=${a.id}" style="padding-left:var(--space-5)">
      <span class="nav-item-icon" style="font-size:0.85rem">${a.emoji}</span>
      <span style="font-size:var(--text-xs)">${a.nombre}</span>
    </a>
  `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  Toast.init();

  // Inicializar Firebase y sincronizar datos
  if (typeof FireSync !== 'undefined') {
    const connected = await FireSync.init();
    if (connected) {
      console.log('✅ Conectado a Firebase — datos sincronizados');
    } else {
      // Sin Firebase: inicializar datos demo localmente
      initDemoData();
    }
  } else {
    initDemoData();
  }

  updateNotifBadge();
  initSidebarToggle();
  initNotifPanel();
});
