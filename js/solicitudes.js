// ============================================================
// SOLICITUDES.JS — CRUD Multi-área + Servicios + Gastos Contables + Cierre
// ============================================================
'use strict';

// ── Estados de Gasto ─────────────────────────────────────────
const ESTADOS_GASTO = [
  { id: 'pendiente',  label: 'Pendiente',  badge: 'badge-pending',   emoji: '⏳' },
  { id: 'aprobado',   label: 'Aprobado',   badge: 'badge-completed', emoji: '✅' },
  { id: 'rechazado',  label: 'Rechazado',  badge: 'badge-cancelled', emoji: '❌' },
];

function getEstadoGasto(id) {
  return ESTADOS_GASTO.find(e => e.id === id) || ESTADOS_GASTO[0];
}

const Solicitudes = {
  // Verifica si un evento está en cobranza (pendiente de pago)
  isPendientePago(s) {
    return s.estado === 'pendiente_pago';
  },

  // Devuelve todos los eventos en estado pendiente_pago
  getPendientePago() {
    return (Store.get('solicitudes') || [])
      .filter(s => s.estado === 'pendiente_pago')
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  // Verifica si un evento tiene cierre contable aprobado
  isCerrado(s) {
    return !!(s.cierreEvento && s.cierreEvento.aprobadoContabilidad === true);
  },

  // Devuelve todos los eventos con cierre contable aprobado
  getCerrados() {
    return (Store.get('solicitudes') || []).filter(s => this.isCerrado(s))
      .sort((a, b) => new Date(b.cierreEvento.aprobadoEn) - new Date(a.cierreEvento.aprobadoEn));
  },

  getAll(filtros = {}) {
    let data = Store.get('solicitudes') || [];

    // ── Excluir eventos en cobranza (Pendiente de Pago) y con cierre contable aprobado
    data = data.filter(s => !this.isCerrado(s) && !this.isPendientePago(s));

    // Filtro por roles/áreas
    if (typeof canSeeAllProjects === 'function' && !canSeeAllProjects()) {
      const allowedAreas = getUserAreas();
      data = data.filter(s => {
        const pAreas = Array.isArray(s.areas) ? s.areas : [s.area].filter(Boolean);
        return pAreas.some(a => allowedAreas.includes(a));
      });
    }

    if (filtros.area && filtros.area !== 'all')
      data = data.filter(s => {
        const areas = Array.isArray(s.areas) ? s.areas : [s.area].filter(Boolean);
        return areas.includes(filtros.area);
      });
    if (filtros.estado && filtros.estado !== 'all')
      data = data.filter(s => s.estado === filtros.estado);
    if (filtros.prioridad && filtros.prioridad !== 'all')
      data = data.filter(s => s.prioridad === filtros.prioridad);
    if (filtros.buscar) {
      const q = filtros.buscar.toLowerCase();
      data = data.filter(s =>
        s.titulo.toLowerCase().includes(q) ||
        s.cliente.toLowerCase().includes(q) ||
        s.ticketId.toLowerCase().includes(q)
      );
    }
    const prioOrd = { alta: 0, media: 1, baja: 2 };
    const statOrd = { pendiente: 0, en_proceso: 1, revision: 2, aprobado: 3, completado: 4, cancelado: 5 };
    data.sort((a, b) => {
      if (filtros.orden === 'fecha_asc')  return new Date(a.fechaEvento) - new Date(b.fechaEvento);
      if (filtros.orden === 'fecha_desc') return new Date(b.fechaEvento) - new Date(a.fechaEvento);
      if (filtros.orden === 'monto')      return (b.financiero?.valorCotizado||0) - (a.financiero?.valorCotizado||0);
      const pa = prioOrd[a.prioridad] ?? 1, pb = prioOrd[b.prioridad] ?? 1;
      if (pa !== pb) return pa - pb;
      return (statOrd[a.estado]??0) - (statOrd[b.estado]??0);
    });
    return data;
  },

  getById(id)      { return (Store.get('solicitudes')||[]).find(s => s.id === id); },
  getByTicket(tid) { return (Store.get('solicitudes')||[]).find(s => s.ticketId === tid); },

  getVigentes() {
    return this.getAll().filter(s => !['completado','cancelado'].includes(s.estado));
  },

  create(datos) {
    const user = Auth.getCurrentUser();
    if (!user) throw new Error('No autenticado');
    let areas = datos.areas || [];
    if (!Array.isArray(areas)) areas = [areas].filter(Boolean);
    if (!areas.length) throw new Error('Selecciona al menos un área');

    const nueva = {
      id: generateId(), ticketId: generateTicketId('SOL'),
      titulo: datos.titulo, cliente: datos.cliente,
      areas,
      estado: 'pendiente', prioridad: datos.prioridad || 'media',
      descripcion: datos.descripcion || '',
      fechaEvento: datos.fechaEvento || '',
      asignadoA: datos.asignadoA || null, creadoPor: user.id,
      contacto: datos.contacto || '', notas: datos.notas || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      historial: [{ estado: 'pendiente', fecha: new Date().toISOString(), usuario: user.id, nota: 'Solicitud creada' }],
      servicios: [],
      cierreEvento: null,
      financiero: {
        valorCotizado: parseFloat(datos.valorCotizado) || 0,
        anticipo:      parseFloat(datos.anticipo) || 0,
        estadoPago: 'sin_pago', gastos: [], comisiones: [],
      },
    };
    Store.push('solicitudes', nueva);
    addNotification('nueva_solicitud', `Nueva solicitud: ${nueva.titulo}`, nueva.ticketId);
    if (typeof Email !== 'undefined') Email.notifyNuevaSolicitud(nueva);
    return nueva;
  },

  update(id, cambios) {
    const user = Auth.getCurrentUser();
    if (!user) throw new Error('No autenticado');
    if (cambios.areas && !Array.isArray(cambios.areas)) cambios.areas = [cambios.areas].filter(Boolean);
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === id);
    if (idx < 0) throw new Error('No encontrada');
    solicitudes[idx] = { ...solicitudes[idx], ...cambios, updatedAt: new Date().toISOString() };
    Store.set('solicitudes', solicitudes);
    return solicitudes[idx];
  },

  cambiarEstado(id, nuevoEstado, nota = '') {
    const user = Auth.getCurrentUser();
    if (!user) throw new Error('No autenticado');
    if (!Auth.can('status')) throw new Error('Sin permiso para cambiar estado');
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === id);
    if (idx < 0) throw new Error('No encontrada');
    const sol = solicitudes[idx];
    const anterior = sol.estado;
    const transiciones = {
      pendiente: ['en_proceso','cancelado'],
      en_proceso:['revision','cancelado','pendiente'],
      revision:  ['aprobado','en_proceso','cancelado'],
      aprobado:  ['completado','en_proceso','cancelado'],
      completado:[], cancelado:['pendiente'],
    };
    if (anterior !== nuevoEstado && !transiciones[anterior]?.includes(nuevoEstado))
      throw new Error(`No se puede pasar de ${anterior} a ${nuevoEstado}`);
    sol.estado = nuevoEstado;
    sol.updatedAt = new Date().toISOString();
    sol.historial = sol.historial || [];
    sol.historial.push({ estado: nuevoEstado, fecha: new Date().toISOString(), usuario: user.id,
      nota: nota || `Estado cambiado a ${getEstado(nuevoEstado).label}` });
    Store.set('solicitudes', solicitudes);
    addNotification('cambio_estado', `${sol.titulo} → ${getEstado(nuevoEstado).label}`, sol.ticketId);
    if (typeof Email !== 'undefined') {
      Email.notifyCambioEstado(sol, anterior, nuevoEstado);
      if (nuevoEstado === 'completado') Email.notifyCompletado(sol);
    }
    return sol;
  },

  delete(id) {
    if (!Auth.can('all')) throw new Error('Solo admins pueden eliminar');
    Store.delete('solicitudes', id);
  },

  getStats() {
    const data = this.getAll();
    const ahora = new Date();
    const inicioSemana = new Date(ahora - 7 * 86400000);
    const activas = data.filter(s => !['completado','cancelado'].includes(s.estado));
    const completadaSemana = data.filter(s => s.estado === 'completado' && new Date(s.updatedAt) >= inicioSemana);
    const urgentes = activas.filter(s => s.prioridad === 'alta');
    const vencen   = activas.filter(s => {
      const fecha = proximaEntrega(s);
      if (!fecha) return false;
      const diff = new Date(fecha) - ahora;
      return diff > 0 && diff < 7 * 86400000;
    });
    const montoActivo = activas.reduce((sum,s) => sum + (s.financiero?.valorCotizado||0), 0);
    const porArea = {};
    getAreas().forEach(a => { porArea[a.id] = { total:0, activas:0, completadas:0 }; });
    data.forEach(s => {
      const areas = Array.isArray(s.areas) ? s.areas : [s.area].filter(Boolean);
      areas.forEach(aId => {
        if (porArea[aId]) {
          porArea[aId].total++;
          if (!['completado','cancelado'].includes(s.estado)) porArea[aId].activas++;
          if (s.estado === 'completado') porArea[aId].completadas++;
        }
      });
    });
    const porEstado = {};
    ESTADOS.forEach(e => { porEstado[e.id] = 0; });
    data.forEach(s => { if (porEstado[s.estado] !== undefined) porEstado[s.estado]++; });
    return { total: data.length, activas: activas.length, completadaSemana: completadaSemana.length,
             urgentes: urgentes.length, vencen: vencen.length, montoActivo, porArea, porEstado };
  },
};

// ── Servicios Contratados ─────────────────────────────────────
const Servicios = {
  agregar(solicitudId, srv) {
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) throw new Error('Solicitud no encontrada');
    const cantidad = parseFloat(srv.cantidad) || 0;
    const pUnitario = parseFloat(srv.precioUnitario) || 0;
    const nuevo = {
      id: generateId(), area: srv.area || '', nombre: srv.nombre || '',
      descripcion: srv.descripcion || '', cantidad,
      unidad: srv.unidad || 'unidades', precioUnitario: pUnitario,
      precioTotal: srv.precioTotal ? parseFloat(srv.precioTotal) : (cantidad * pUnitario),
      fechaEntrega: srv.fechaEntrega || '', responsable: srv.responsable || '',
      estado: srv.estado || 'pendiente', notas: srv.notas || '',
      creadoEn: new Date().toISOString(),
    };
    solicitudes[idx].servicios = solicitudes[idx].servicios || [];
    solicitudes[idx].servicios.push(nuevo);
    solicitudes[idx].updatedAt = new Date().toISOString();
    if (!solicitudes[idx].financiero?.valorCotizado) {
      const total = solicitudes[idx].servicios.reduce((s,sv) => s + sv.precioTotal, 0);
      solicitudes[idx].financiero = solicitudes[idx].financiero || {};
      solicitudes[idx].financiero.valorCotizado = total;
    }
    Store.set('solicitudes', solicitudes);
    return nuevo;
  },

  actualizar(solicitudId, srvId, cambios) {
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) return;
    const srvIdx = (solicitudes[idx].servicios || []).findIndex(s => s.id === srvId);
    if (srvIdx < 0) return;
    const srv = { ...solicitudes[idx].servicios[srvIdx], ...cambios };
    if (cambios.cantidad !== undefined || cambios.precioUnitario !== undefined)
      srv.precioTotal = srv.cantidad * srv.precioUnitario;
    solicitudes[idx].servicios[srvIdx] = srv;
    solicitudes[idx].updatedAt = new Date().toISOString();
    Store.set('solicitudes', solicitudes);
  },

  cambiarEstado(solicitudId, srvId, nuevoEstado) {
    this.actualizar(solicitudId, srvId, { estado: nuevoEstado });
  },

  eliminar(solicitudId, srvId) {
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) return;
    solicitudes[idx].servicios = (solicitudes[idx].servicios || []).filter(s => s.id !== srvId);
    solicitudes[idx].updatedAt = new Date().toISOString();
    Store.set('solicitudes', solicitudes);
  },

  sincronizarFinanciero(solicitudId) {
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) return;
    const total = (solicitudes[idx].servicios || []).reduce((s,sv) => s + (sv.precioTotal||0), 0);
    solicitudes[idx].financiero = solicitudes[idx].financiero || {};
    solicitudes[idx].financiero.valorCotizado = total;
    solicitudes[idx].updatedAt = new Date().toISOString();
    Store.set('solicitudes', solicitudes);
  },
};

// ── Módulo Financiero ─────────────────────────────────────────
const Financiero = {
  // ── GASTOS CONTABLES ─────────────────────────────────────
  agregarGasto(solicitudId, gasto) {
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) throw new Error('Solicitud no encontrada');

    const user = Auth.getCurrentUser();
    const subtotal = parseFloat(gasto.monto) || 0;
    const impuesto = parseFloat(gasto.impuesto) || 0;
    const total    = subtotal + impuesto;

    const nuevoGasto = {
      id: generateId(),
      // Básico
      categoria:        gasto.categoria || 'otros',
      descripcion:      gasto.descripcion || '',
      fecha:            gasto.fecha || new Date().toISOString().split('T')[0],
      // Contable (NUEVO)
      proveedor:        gasto.proveedor || '',
      numeroFactura:    gasto.numeroFactura || '',
      metodoPago:       gasto.metodoPago || 'efectivo',
      comprobante:      gasto.comprobante || '',
      subtotal,
      impuesto,
      monto:            total,          // total = subtotal + impuesto
      notas:            gasto.notas || '',
      // Flujo de aprobación
      estado:           'pendiente',
      aprobadoPor:      null,
      aprobadoEn:       null,
      rechazadoPor:     null,
      motivoRechazo:    '',
      // Auditoría
      registradoPor:    user?.id || null,
      creadoEn:         new Date().toISOString(),
    };

    // Garantizar estructura completa del financiero antes de hacer push
    solicitudes[idx].financiero = solicitudes[idx].financiero || {};
    solicitudes[idx].financiero.gastos      = Array.isArray(solicitudes[idx].financiero.gastos)      ? solicitudes[idx].financiero.gastos      : [];
    solicitudes[idx].financiero.comisiones  = Array.isArray(solicitudes[idx].financiero.comisiones)  ? solicitudes[idx].financiero.comisiones  : [];
    solicitudes[idx].financiero.gastos.push(nuevoGasto);
    solicitudes[idx].updatedAt = new Date().toISOString();
    Store.set('solicitudes', solicitudes);
    addNotification('pago', `Gasto registrado: ${Fmt.currency(total)} — ${solicitudes[idx].titulo}`);
    return nuevoGasto;
  },

  // ── APROBACIÓN DE GASTOS ──────────────────────────────────
  aprobarGasto(solicitudId, gastoId) {
    const user = Auth.getCurrentUser();
    if (!Auth.can('all')) throw new Error('Solo admins pueden aprobar gastos');
    return this._cambiarEstadoGasto(solicitudId, gastoId, 'aprobado', { aprobadoPor: user.id, aprobadoEn: new Date().toISOString() });
  },

  rechazarGasto(solicitudId, gastoId, motivo) {
    const user = Auth.getCurrentUser();
    if (!Auth.can('all')) throw new Error('Solo admins pueden rechazar gastos');
    return this._cambiarEstadoGasto(solicitudId, gastoId, 'rechazado', {
      rechazadoPor: user.id, motivoRechazo: motivo || '', aprobadoEn: new Date().toISOString(),
    });
  },

  _cambiarEstadoGasto(solicitudId, gastoId, estado, extra = {}) {
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) return;
    const gIdx = (solicitudes[idx].financiero?.gastos || []).findIndex(g => g.id === gastoId);
    if (gIdx < 0) return;
    solicitudes[idx].financiero.gastos[gIdx] = {
      ...solicitudes[idx].financiero.gastos[gIdx], estado, ...extra,
    };
    solicitudes[idx].updatedAt = new Date().toISOString();
    Store.set('solicitudes', solicitudes);
    return solicitudes[idx].financiero.gastos[gIdx];
  },

  editarGasto(solicitudId, gastoId, cambios) {
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) return;
    const gIdx = (solicitudes[idx].financiero?.gastos || []).findIndex(g => g.id === gastoId);
    if (gIdx < 0) return;
    const g = { ...solicitudes[idx].financiero.gastos[gIdx], ...cambios };
    // Recalcular monto total si cambiaron subtotal o impuesto
    if (cambios.subtotal !== undefined || cambios.impuesto !== undefined) {
      g.monto = (parseFloat(g.subtotal)||0) + (parseFloat(g.impuesto)||0);
    }
    // Volver a pendiente si se edita un gasto aprobado
    if (solicitudes[idx].financiero.gastos[gIdx].estado === 'aprobado') g.estado = 'pendiente';
    solicitudes[idx].financiero.gastos[gIdx] = g;
    solicitudes[idx].updatedAt = new Date().toISOString();
    Store.set('solicitudes', solicitudes);
    return g;
  },

  eliminarGasto(solicitudId, gastoId) {
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) return;
    const gasto = (solicitudes[idx].financiero?.gastos||[]).find(g => g.id === gastoId);
    if (gasto?.estado === 'aprobado' && !Auth.can('all')) throw new Error('No puedes eliminar un gasto aprobado');
    solicitudes[idx].financiero.gastos = solicitudes[idx].financiero.gastos.filter(g => g.id !== gastoId);
    solicitudes[idx].updatedAt = new Date().toISOString();
    Store.set('solicitudes', solicitudes);
  },

  // ── FINANCIERO GENERAL Y PAGOS ────────────────────────────
  agregarPago(solicitudId, pago) {
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) throw new Error('Solicitud no encontrada');
    const user = Auth.getCurrentUser();
    
    const nuevoPago = {
      id: generateId(),
      monto: parseFloat(pago.monto) || 0,
      fecha: pago.fecha || new Date().toISOString().split('T')[0],
      metodoPago: pago.metodoPago || 'transferencia',
      comprobante: pago.comprobante || '',
      notas: pago.notas || '',
      registradoPor: user?.id || null,
      creadoEn: new Date().toISOString(),
    };
    
    solicitudes[idx].financiero = solicitudes[idx].financiero || {};
    solicitudes[idx].financiero.pagos = solicitudes[idx].financiero.pagos || [];
    solicitudes[idx].financiero.pagos.push(nuevoPago);
    solicitudes[idx].updatedAt = new Date().toISOString();
    Store.set('solicitudes', solicitudes);
    addNotification('pago', `Pago cliente: ${Fmt.currency(nuevoPago.monto)} — ${solicitudes[idx].titulo}`);
    return nuevoPago;
  },

  editarPago(solicitudId, pagoId, datos) {
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) throw new Error('Solicitud no encontrada');
    
    if (!solicitudes[idx].financiero?.pagos) return;
    const pIdx = solicitudes[idx].financiero.pagos.findIndex(p => p.id === pagoId);
    if (pIdx < 0) return;

    solicitudes[idx].financiero.pagos[pIdx] = {
      ...solicitudes[idx].financiero.pagos[pIdx],
      monto: datos.monto !== undefined ? parseFloat(datos.monto) : solicitudes[idx].financiero.pagos[pIdx].monto,
      fecha: datos.fecha !== undefined ? datos.fecha : solicitudes[idx].financiero.pagos[pIdx].fecha,
      metodoPago: datos.metodoPago !== undefined ? datos.metodoPago : solicitudes[idx].financiero.pagos[pIdx].metodoPago,
      comprobante: datos.comprobante !== undefined ? datos.comprobante : solicitudes[idx].financiero.pagos[pIdx].comprobante,
      notas: datos.notas !== undefined ? datos.notas : solicitudes[idx].financiero.pagos[pIdx].notas,
    };
    
    solicitudes[idx].updatedAt = new Date().toISOString();
    Store.set('solicitudes', solicitudes);
  },

  eliminarPago(solicitudId, pagoId) {
    if (!Auth.can('all')) throw new Error('Solo admins pueden eliminar pagos');
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) return;
    if (solicitudes[idx].financiero?.pagos) {
      solicitudes[idx].financiero.pagos = solicitudes[idx].financiero.pagos.filter(p => p.id !== pagoId);
      solicitudes[idx].updatedAt = new Date().toISOString();
      Store.set('solicitudes', solicitudes);
    }
  },

  agregarGastoFijo(solicitudId, gastoFijo) {
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) throw new Error('Solicitud no encontrada');
    const user = Auth.getCurrentUser();
    
    const cantidad = parseFloat(gastoFijo.cantidad) || 1;
    const valorUnitario = parseFloat(gastoFijo.valorUnitario) || parseFloat(gastoFijo.monto) || 0;

    const nuevoGastoFijo = {
      id: generateId(),
      gastoDefectoId: gastoFijo.gastoDefectoId || 'custom',
      descripcion: gastoFijo.descripcion,
      categoria: gastoFijo.categoria || 'otros',
      cantidad: cantidad,
      valorUnitario: valorUnitario,
      monto: cantidad * valorUnitario,
      registradoPor: user?.id || null,
      creadoEn: new Date().toISOString(),
    };
    
    solicitudes[idx].financiero = solicitudes[idx].financiero || {};
    solicitudes[idx].financiero.gastosFijos = solicitudes[idx].financiero.gastosFijos || [];
    solicitudes[idx].financiero.gastosFijos.push(nuevoGastoFijo);
    solicitudes[idx].updatedAt = new Date().toISOString();
    Store.set('solicitudes', solicitudes);
    addNotification('gasto', `Gasto fijo añadido: ${Fmt.currency(nuevoGastoFijo.monto)} — ${solicitudes[idx].titulo}`);
    return nuevoGastoFijo;
  },

  editarGastoFijo(solicitudId, gastoId, datos) {
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) throw new Error('Solicitud no encontrada');
    
    if (!solicitudes[idx].financiero?.gastosFijos) return;
    const gastoIdx = solicitudes[idx].financiero.gastosFijos.findIndex(g => g.id === gastoId);
    if (gastoIdx < 0) return;

    const g = solicitudes[idx].financiero.gastosFijos[gastoIdx];
    const cantidad = datos.cantidad !== undefined ? parseFloat(datos.cantidad) : (g.cantidad || 1);
    const valorUnitario = datos.valorUnitario !== undefined ? parseFloat(datos.valorUnitario) : (g.valorUnitario || g.monto || 0);

    solicitudes[idx].financiero.gastosFijos[gastoIdx] = {
      ...g,
      gastoDefectoId: datos.gastoDefectoId !== undefined ? datos.gastoDefectoId : g.gastoDefectoId,
      descripcion: datos.descripcion !== undefined ? datos.descripcion : g.descripcion,
      categoria: datos.categoria !== undefined ? datos.categoria : g.categoria,
      cantidad: cantidad,
      valorUnitario: valorUnitario,
      monto: cantidad * valorUnitario,
    };
    
    solicitudes[idx].updatedAt = new Date().toISOString();
    Store.set('solicitudes', solicitudes);
  },

  eliminarGastoFijo(solicitudId, gastoId) {
    if (!Auth.can('all')) throw new Error('Solo admins pueden eliminar gastos fijos');
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) return;
    if (solicitudes[idx].financiero?.gastosFijos) {
      solicitudes[idx].financiero.gastosFijos = solicitudes[idx].financiero.gastosFijos.filter(g => g.id !== gastoId);
      solicitudes[idx].updatedAt = new Date().toISOString();
      Store.set('solicitudes', solicitudes);
    }
  },

  actualizarFinanciero(solicitudId, datos) {
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) throw new Error('No encontrada');
    const fin = solicitudes[idx].financiero || {};
    solicitudes[idx].financiero = {
      ...fin,
      valorCotizado: parseFloat(datos.valorCotizado) ?? fin.valorCotizado ?? 0,
      anticipo:      parseFloat(datos.anticipo)      ?? fin.anticipo      ?? 0,
      estadoPago:    datos.estadoPago || fin.estadoPago || 'sin_pago',
    };
    solicitudes[idx].updatedAt = new Date().toISOString();
    Store.set('solicitudes', solicitudes);
    return solicitudes[idx];
  },

  agregarComision(solicitudId, comision) {
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) throw new Error('No encontrada');
    const base = solicitudes[idx].financiero?.valorCotizado || 0;
    const nueva = {
      id: generateId(), usuarioId: comision.usuarioId,
      porcentaje: parseFloat(comision.porcentaje)||0,
      monto: comision.monto ? parseFloat(comision.monto) : (base * (parseFloat(comision.porcentaje)/100)),
      concepto: comision.concepto || 'Comisión',
    };
    solicitudes[idx].financiero.comisiones = solicitudes[idx].financiero.comisiones || [];
    solicitudes[idx].financiero.comisiones.push(nueva);
    solicitudes[idx].updatedAt = new Date().toISOString();
    Store.set('solicitudes', solicitudes);
    return nueva;
  },

  calcularResumen(solicitud) {
    const fin = solicitud?.financiero || {};
    const valorCotizado = fin.valorCotizado || 0;
    
    // El anticipo (total pagado por el cliente) es la suma de los pagos registrados o el anticipo fijo por retrocompatibilidad
    const totalPagos = (fin.pagos||[]).reduce((s,p) => s + (p.monto||0), 0);
    const anticipo   = totalPagos > 0 ? totalPagos : (fin.anticipo || 0);
    
    // Gastos fijos (se asumen siempre aprobados y sumados al total)
    const totalGastosFijos = (fin.gastosFijos||[]).reduce((s,g) => s + (g.monto||0), 0);
    
    // Solo sumar gastos aprobados o pendientes (excluir rechazados)
    const gastosActivos = (fin.gastos||[]).filter(g => g.estado !== 'rechazado');
    const gastos     = gastosActivos.reduce((s,g) => s + (g.monto||0), 0) + totalGastosFijos;
    const gastosAprobados = (fin.gastos||[]).filter(g => g.estado === 'aprobado').reduce((s,g) => s + (g.monto||0), 0) + totalGastosFijos;
    const gastosPendientes = (fin.gastos||[]).filter(g => g.estado === 'pendiente').reduce((s,g) => s + (g.monto||0), 0);
    const gastosRechazados = (fin.gastos||[]).filter(g => g.estado === 'rechazado').reduce((s,g) => s + (g.monto||0), 0);
    
    const comisionesBasicas = (fin.comisiones||[]).reduce((s,c) => s + (c.monto||0), 0);
    const utilidadBruta = valorCotizado - gastos - comisionesBasicas;
    const comisionSistema = utilidadBruta > 0 ? utilidadBruta * 0.10 : 0;
    const comisiones = comisionesBasicas + comisionSistema;
    
    const saldo      = Math.max(0, valorCotizado - anticipo);
    const utilidad   = valorCotizado - gastos - comisiones;
    const margen     = valorCotizado ? Fmt.percent(utilidad, valorCotizado) : 0;
    return { valorCotizado, anticipo, saldo, gastos, gastosAprobados, gastosPendientes, gastosRechazados, comisiones, comisionSistema, utilidadBruta, utilidad, margen };
  },

  getResumenGlobal() {
    const data = typeof Solicitudes !== 'undefined' ? Solicitudes.getAll() : (Store.get('solicitudes') || []);
    const totalCotizado   = data.reduce((s,x) => s + (x.financiero?.valorCotizado||0), 0);
    const totalAnticipo   = data.reduce((s,x) => {
      const p = (x.financiero?.pagos||[]).reduce((sum, pago) => sum + (pago.monto||0), 0);
      return s + (p > 0 ? p : (x.financiero?.anticipo||0));
    }, 0);
    const totalGastos = data.reduce((s,x) => {
      const gf = (x.financiero?.gastosFijos||[]).reduce((a,g) => a+(g.monto||0),0);
      const g = (x.financiero?.gastos||[]).filter(gx=>gx.estado!=='rechazado').reduce((a,gx) => a+(gx.monto||0),0);
      return s + gf + g;
    }, 0);
    
    let totalComisiones = 0;
    data.forEach(x => {
      const vc = x.financiero?.valorCotizado||0;
      const gf = (x.financiero?.gastosFijos||[]).reduce((a,g) => a+(g.monto||0),0);
      const g = (x.financiero?.gastos||[]).filter(gx=>gx.estado!=='rechazado').reduce((a,gx) => a+(gx.monto||0),0);
      const c = (x.financiero?.comisiones||[]).reduce((a,c) => a+(c.monto||0),0);
      const ub = vc - (gf + g) - c;
      const cs = ub > 0 ? ub * 0.10 : 0;
      totalComisiones += (c + cs);
    });
    
    const totalUtilidad   = totalCotizado - totalGastos - totalComisiones;
    const pendienteCobro  = totalCotizado - totalAnticipo;
    const porArea = {};
    getAreas().forEach(a => { porArea[a.id] = { cotizado:0, gastos:0, utilidad:0 }; });
    data.forEach(s => {
      const areas = Array.isArray(s.areas) ? s.areas : [s.area].filter(Boolean);
      const g = (s.financiero?.gastos||[]).filter(gx=>gx.estado!=='rechazado').reduce((a,g) => a+(g.monto||0),0);
      const c = (s.financiero?.comisiones||[]).reduce((a,c) => a+(c.monto||0),0);
      const split = areas.length || 1;
      areas.forEach(aId => {
        if (porArea[aId]) {
          porArea[aId].cotizado += (s.financiero?.valorCotizado||0) / split;
          porArea[aId].gastos   += (g+c) / split;
          porArea[aId].utilidad += ((s.financiero?.valorCotizado||0) - g - c) / split;
        }
      });
    });
    const porCategoria = {};
    CATEGORIAS_GASTO.forEach(c => { porCategoria[c.id] = 0; });
    data.forEach(s => { (s.financiero?.gastos||[]).filter(g=>g.estado!=='rechazado').forEach(g => { if (porCategoria[g.categoria]!==undefined) porCategoria[g.categoria] += (g.monto||0); }); });
    const porEstadoPago = { sin_pago:0, parcial:0, pagado:0, vencido:0 };
    data.forEach(s => { const ep = s.financiero?.estadoPago||'sin_pago'; if (porEstadoPago[ep]!==undefined) porEstadoPago[ep]++; });
    return { totalCotizado, totalAnticipo, totalGastos, totalComisiones, totalUtilidad, pendienteCobro, porArea, porCategoria, porEstadoPago };
  },
};

// ── CIERRE DE EVENTO ──────────────────────────────────────────
const CierreEvento = {

  // Crea o actualiza el cierre del evento
  crear(solicitudId, datos = {}) {
    const user = Auth.getCurrentUser();
    if (!user) throw new Error('No autenticado');

    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0) throw new Error('Solicitud no encontrada');

    const sol = solicitudes[idx];
    const res = Financiero.calcularResumen(sol);

    // Gastos pendientes de aprobación
    const gastosPendientes = (sol.financiero?.gastos||[]).filter(g => g.estado === 'pendiente').length;

    const cierre = {
      id:            sol.cierreEvento?.id || generateId(),
      solicitudId,
      version:       (sol.cierreEvento?.version || 0) + 1,
      creadoPor:     user.id,
      creadoEn:      new Date().toISOString(),
      // Snapshot completo del proyecto
      snapshot: {
        titulo:         sol.titulo,
        cliente:        sol.cliente,
        ticketId:       sol.ticketId,
        areas:          Array.isArray(sol.areas) ? sol.areas : [sol.area].filter(Boolean),
        fechaEvento:    sol.fechaEvento,
        estadoProyecto: sol.estado,
        // Financiero
        valorCotizado:  res.valorCotizado,
        anticipo:       res.anticipo,
        saldo:          res.saldo,
        totalGastos:    res.gastos,
        gastosAprobados: res.gastosAprobados,
        gastosPendientes: res.gastosPendientes,
        gastosRechazados: res.gastosRechazados,
        comisiones:     res.comisiones,
        utilidad:       res.utilidad,
        margen:         res.margen,
        estadoPago:     sol.financiero?.estadoPago || 'sin_pago',
        // Servicios
        totalServicios:    (sol.servicios||[]).length,
        serviciosEntregados: (sol.servicios||[]).filter(s => s.estado === 'entregado').length,
        // Detalles para el reporte
        gastos:      sol.financiero?.gastos || [],
        comisionesDetalle: sol.financiero?.comisiones || [],
        servicios:   sol.servicios || [],
      },
      // Campos del cierre
      notasContabilidad: datos.notasContabilidad || '',
      observaciones:     datos.observaciones || '',
      gastosPendientesAlCierre: gastosPendientes,
      estado: gastosPendientes > 0 ? 'con_pendientes' : 'listo',
      // Aprobación contable
      aprobadoContabilidad: false,
      aprobadoPor: null,
      aprobadoEn:  null,
      numeroReferencia: datos.numeroReferencia || `CIE-${sol.ticketId}`,
    };

    solicitudes[idx].cierreEvento = cierre;
    solicitudes[idx].updatedAt = new Date().toISOString();

    // Auto-completar el proyecto si no está cerrado
    if (!['completado','cancelado'].includes(sol.estado)) {
      sol.estado = 'completado';
      sol.historial = sol.historial || [];
      sol.historial.push({ estado:'completado', fecha: new Date().toISOString(), usuario: user.id, nota: 'Cierre de evento generado' });
    }

    Store.set('solicitudes', solicitudes);
    addNotification('cierre', `Cierre generado: ${sol.titulo}`, sol.ticketId);
    return cierre;
  },

  // Aprobar el cierre desde contabilidad
  aprobar(solicitudId, aprobadoPor, observaciones = '') {
    const user = Auth.getCurrentUser();
    if (!Auth.can('all')) throw new Error('Solo admins pueden aprobar cierres');
    const solicitudes = Store.get('solicitudes') || [];
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx < 0 || !solicitudes[idx].cierreEvento) throw new Error('Sin cierre registrado');
    solicitudes[idx].cierreEvento.aprobadoContabilidad = true;
    solicitudes[idx].cierreEvento.aprobadoPor = aprobadoPor || user.id;
    solicitudes[idx].cierreEvento.aprobadoEn  = new Date().toISOString();
    solicitudes[idx].cierreEvento.estado       = 'aprobado_contabilidad';
    if (observaciones) solicitudes[idx].cierreEvento.observacionesContabilidad = observaciones;
    solicitudes[idx].updatedAt = new Date().toISOString();
    Store.set('solicitudes', solicitudes);
    return solicitudes[idx].cierreEvento;
  },

  get(solicitudId) {
    const sol = Solicitudes.getById(solicitudId);
    return sol?.cierreEvento || null;
  },

  getAll() {
    return (Store.get('solicitudes') || [])
      .filter(s => s.cierreEvento)
      .map(s => ({ ...s.cierreEvento, solicitud: s }))
      .sort((a,b) => new Date(b.creadoEn) - new Date(a.creadoEn));
  },
};

// ============================================================
// CUENTAS DE COBRO
// ============================================================
const CuentasCobro = {
  crear(datos) {
    const user = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
    const cuentas = Store.get('cuentasCobro') || [];
    
    // Si viene nombre/documento explícito (desde público), los usamos.
    // De lo contrario, usamos los datos del usuario logueado.
    const nombre = datos.nombre || (user ? user.nombre : 'Desconocido');
    const documento = datos.documento || '';
    const userId = user ? user.id : 'publico';

    const nueva = {
      id: generateId(),
      usuarioId: userId,
      nombreContratista: nombre,
      documentoContratista: documento,
      proyectoId: datos.proyectoId,
      proyectoNombreRespaldo: datos.proyectoNombreRespaldo || '',
      monto: parseFloat(datos.monto) || 0,
      concepto: datos.concepto || '',
      soporte: datos.soporte || '',
      estado: 'pendiente', // pendiente, aprobado, pagado, rechazado
      motivoRechazo: '',
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
      pagadoEn: null,
      pagadoPor: null
    };
    cuentas.push(nueva);
    Store.set('cuentasCobro', cuentas);
    // Notificar admin si hay sesión
    if (typeof addNotification === 'function' && user) {
      addNotification('finanzas', `Nueva cuenta de cobro enviada por ${nombre}: ${Fmt.currency(nueva.monto)}`);
    }
    return nueva;
  },

  getAll() {
    return Store.get('cuentasCobro') || [];
  },

  getByUsuario(usuarioId) {
    return this.getAll().filter(c => c.usuarioId === usuarioId);
  },

  getByProyecto(proyectoId) {
    return this.getAll().filter(c => c.proyectoId === proyectoId);
  },

  cambiarEstado(cuentaId, estado, opciones = {}) {
    if (!Auth.can('all')) throw new Error('Solo admin puede cambiar el estado de las cuentas de cobro');
    const cuentas = Store.get('cuentasCobro') || [];
    const idx = cuentas.findIndex(c => c.id === cuentaId);
    if (idx < 0) throw new Error('Cuenta de cobro no encontrada');

    const cuenta = cuentas[idx];
    cuenta.estado = estado;
    cuenta.actualizadoEn = new Date().toISOString();

    if (estado === 'rechazado') {
      cuenta.motivoRechazo = opciones.motivo || '';
    } else if (estado === 'pagado') {
      cuenta.pagadoEn = new Date().toISOString();
      cuenta.pagadoPor = Auth.getCurrentUser().id;
      
      // Auto-registrar como gasto variable en el proyecto asociado
      if (opciones.registrarGasto && cuenta.proyectoId) {
        try {
          const u = getUserById(cuenta.usuarioId);
          const nombreUsuario = u ? u.nombre : 'Desconocido';
          const gastoDesc = `Pago cuenta de cobro - ${nombreUsuario}: ${cuenta.concepto}`;
          
          Financiero.agregarGasto(cuenta.proyectoId, {
            descripcion: gastoDesc,
            categoria: 'honorarios', // O una genérica si no existe
            subtotal: cuenta.monto,
            impuesto: 0,
            fecha: new Date().toISOString().split('T')[0],
            proveedor: nombreUsuario,
            notas: `Generado automáticamente desde módulo Cuentas de Cobro. Ref: ${cuenta.id}`,
            comprobante: cuenta.soporte || ''
          });
          
          // Aprobar el gasto inmediatamente ya que lo está registrando un admin
          const sols = Store.get('solicitudes') || [];
          const sIdx = sols.findIndex(s => s.id === cuenta.proyectoId);
          if (sIdx >= 0 && sols[sIdx].financiero?.gastos?.length) {
            const lastGasto = sols[sIdx].financiero.gastos[sols[sIdx].financiero.gastos.length - 1];
            Financiero.aprobarGasto(cuenta.proyectoId, lastGasto.id);
          }
        } catch(e) {
          console.error('Error auto-registrando gasto:', e);
        }
      }
    }

    Store.set('cuentasCobro', cuentas);
    return cuenta;
  },

  eliminar(cuentaId) {
    const cuentas = Store.get('cuentasCobro') || [];
    const idx = cuentas.findIndex(c => c.id === cuentaId);
    if (idx < 0) return;
    
    const cuenta = cuentas[idx];
    const user = Auth.getCurrentUser();
    
    // Solo el creador si está pendiente, o un admin puede eliminar
    if (cuenta.usuarioId !== user.id && !Auth.can('all')) {
      throw new Error('No puedes eliminar cuentas de cobro de otras personas');
    }
    if (cuenta.estado !== 'pendiente' && !Auth.can('all')) {
      throw new Error('No puedes eliminar una cuenta que ya ha sido procesada');
    }

    cuentas.splice(idx, 1);
    Store.set('cuentasCobro', cuentas);
  }
};

window.CuentasCobro = CuentasCobro;
