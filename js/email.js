// ============================================================
// EMAIL.JS — Envío de Notificaciones por Email via EmailJS
// ============================================================

'use strict';

const Email = {
  _initialized: false,

  init() {
    if (typeof emailjs === 'undefined') {
      console.warn('EmailJS no cargado. Las notificaciones por email no estarán disponibles.');
      return false;
    }
    if (!EMAILJS_CONFIG.publicKey.includes('TU_')) {
      emailjs.init(EMAILJS_CONFIG.publicKey);
      this._initialized = true;
      console.log('✅ EmailJS inicializado');
    } else {
      console.warn('EmailJS no configurado (clave pública no definida). Modo demo activo.');
    }
    return this._initialized;
  },

  async _send(params) {
    if (!this._initialized) {
      console.log('[EMAIL DEMO]', params);
      return;
    }
    try {
      await emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, params);
    } catch(err) {
      console.error('Error enviando email:', err);
    }
  },

  // Obtener emails de destinatarios
  _getRecipients(solicitud) {
    const users = Store.get('users') || [];
    const admins = users.filter(u => u.rol === 'admin' && u.email);
    const asignado = solicitud.asignadoA ? users.find(u => u.id === solicitud.asignadoA) : null;
    const creador  = solicitud.creadoPor  ? users.find(u => u.id === solicitud.creadoPor) : null;

    const set = new Set();
    admins.forEach(u => set.add(u.email));
    if (asignado?.email) set.add(asignado.email);
    if (creador?.email)  set.add(creador.email);

    return [...set];
  },

  async notifyNuevaSolicitud(solicitud) {
    const area = getArea(solicitud.area);
    const recipients = this._getRecipients(solicitud);

    for (const email of recipients) {
      await this._send({
        to_email:     email,
        subject:      `[${solicitud.ticketId}] Nueva Solicitud: ${solicitud.titulo}`,
        titulo:       '📋 Nueva Solicitud Creada',
        cuerpo:       `Se ha creado una nueva solicitud que requiere tu atención.`,
        ticket_id:    solicitud.ticketId,
        proyecto:     solicitud.titulo,
        cliente:      solicitud.cliente,
        area:         `${area.emoji} ${area.nombre}`,
        prioridad:    getPrioridad(solicitud.prioridad).label,
        fecha_evento: solicitud.fechaEvento ? Fmt.date(solicitud.fechaEvento) : 'No definida',
        estado:       getEstado(solicitud.estado).label,
        descripcion:  solicitud.descripcion || '',
        empresa:      EMPRESA_CONFIG.nombre,
      });
    }
  },

  async notifyCambioEstado(solicitud, estadoAnterior, nuevoEstado) {
    const area = getArea(solicitud.area);
    const recipients = this._getRecipients(solicitud);
    const eAnterior = getEstado(estadoAnterior);
    const eNuevo    = getEstado(nuevoEstado);

    for (const email of recipients) {
      await this._send({
        to_email:  email,
        subject:   `[${solicitud.ticketId}] Estado actualizado → ${eNuevo.label}`,
        titulo:    `🔄 Cambio de Estado: ${eAnterior.label} → ${eNuevo.label}`,
        cuerpo:    `El proyecto ha cambiado de estado.`,
        ticket_id: solicitud.ticketId,
        proyecto:  solicitud.titulo,
        cliente:   solicitud.cliente,
        area:      `${area.emoji} ${area.nombre}`,
        estado:    eNuevo.label,
        empresa:   EMPRESA_CONFIG.nombre,
      });
    }
  },

  async notifyCompletado(solicitud) {
    const area = getArea(solicitud.area);
    const recipients = this._getRecipients(solicitud);
    const resumen = Financiero.calcularResumen(solicitud);

    for (const email of recipients) {
      await this._send({
        to_email:  email,
        subject:   `✅ [${solicitud.ticketId}] Proyecto Completado: ${solicitud.titulo}`,
        titulo:    '🎯 Proyecto Completado',
        cuerpo:    `¡El proyecto ha sido completado exitosamente!`,
        ticket_id: solicitud.ticketId,
        proyecto:  solicitud.titulo,
        cliente:   solicitud.cliente,
        area:      `${area.emoji} ${area.nombre}`,
        estado:    '✅ Completado',
        valor:     Fmt.currency(resumen.valorCotizado),
        empresa:   EMPRESA_CONFIG.nombre,
      });
    }
  },
};

// Inicializar EmailJS cuando el DOM cargue
document.addEventListener('DOMContentLoaded', () => Email.init());
