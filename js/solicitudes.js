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
  getAll(filtros = {}) {
    let data = Store.get('solicitudes') || [];

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
    const data = Store.get('solicitudes') || [];
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

    solicitudes[idx].financiero = solicitudes[idx].financiero || { gastos:[], comisiones:[] };
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

  // ── FINANCIERO GENERAL ────────────────────────────────────
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
    const anticipo   = fin.anticipo || 0;
    // Solo sumar gastos aprobados o pendientes (excluir rechazados)
    const gastosActivos = (fin.gastos||[]).filter(g => g.estado !== 'rechazado');
    const gastos     = gastosActivos.reduce((s,g) => s + (g.monto||0), 0);
    const gastosAprobados = (fin.gastos||[]).filter(g => g.estado === 'aprobado').reduce((s,g) => s + (g.monto||0), 0);
    const gastosPendientes = (fin.gastos||[]).filter(g => g.estado === 'pendiente').reduce((s,g) => s + (g.monto||0), 0);
    const gastosRechazados = (fin.gastos||[]).filter(g => g.estado === 'rechazado').reduce((s,g) => s + (g.monto||0), 0);
    const comisiones = (fin.comisiones||[]).reduce((s,c) => s + (c.monto||0), 0);
    const saldo      = valorCotizado - anticipo;
    const utilidad   = valorCotizado - gastos - comisiones;
    const margen     = valorCotizado ? Fmt.percent(utilidad, valorCotizado) : 0;
    return { valorCotizado, anticipo, saldo, gastos, gastosAprobados, gastosPendientes, gastosRechazados, comisiones, utilidad, margen };
  },

  getResumenGlobal() {
    const data = Store.get('solicitudes') || [];
    const totalCotizado   = data.reduce((s,x) => s + (x.financiero?.valorCotizado||0), 0);
    const totalAnticipo   = data.reduce((s,x) => s + (x.financiero?.anticipo||0), 0);
    const totalGastos     = data.reduce((s,x) => s + (x.financiero?.gastos||[]).filter(g=>g.estado!=='rechazado').reduce((a,g) => a+(g.monto||0),0), 0);
    const totalComisiones = data.reduce((s,x) => s + (x.financiero?.comisiones||[]).reduce((a,c) => a+(c.monto||0),0), 0);
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
