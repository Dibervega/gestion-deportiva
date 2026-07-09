# ============================================================
# COMANDOS.PY — Handlers de Telegram para Gestión Deportiva
# ============================================================
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from . import firebase_db as db
from . import ia

logger = logging.getLogger(__name__)

ESTADO_LABELS = {
    'pendiente':   '⏳ Pendiente',
    'en_proceso':  '🔄 En Proceso',
    'revision':    '👁️ En Revisión',
    'aprobado':    '✅ Aprobado',
    'completado':  '🏁 Completado',
    'cancelado':   '❌ Cancelado',
}


def formato_moneda(valor: float) -> str:
    return f'${valor:,.0f}'.replace(',', '.')


def formato_resumen(datos: dict, areas: list) -> str:
    area_labels = []
    for aid in datos.get('areas', []):
        a = next((x for x in areas if x['id'] == aid), None)
        area_labels.append(f"{a['emoji']} {a['nombre']}" if a else aid)

    servicios = datos.get('servicios', [])
    srv_str = '\n'.join(
        f"  • {s['nombre']}" + (f" ({s['cantidad']} {s['unidad']})" if s.get('cantidad') else '')
        for s in servicios[:5]
    ) or '  (ninguno detectado)'

    fin    = datos.get('financiero', {})
    valor  = formato_moneda(fin.get('valorCotizado', 0)) if fin.get('valorCotizado') else 'No especificado'
    anticipo = formato_moneda(fin.get('anticipo', 0)) if fin.get('anticipo') else '—'

    conf   = datos.get('confianza', 0)
    conf_s = '🟢 Alta' if conf >= 0.9 else '🟡 Media' if conf >= 0.7 else '🔴 Baja'

    faltantes = datos.get('camposFaltantes', [])
    falt_str  = f'\n⚠️ *Sin especificar:* {", ".join(faltantes)}' if faltantes else ''

    return (
        f'📋 *Resumen de la Solicitud*\n\n'
        f'📌 *Proyecto:* {datos.get("titulo", "—")}\n'
        f'👤 *Cliente:* {datos.get("cliente", "—")}\n'
        f'📅 *Fecha del evento:* {datos.get("fechaEvento") or "No especificada"}\n'
        f'🏢 *Áreas:* {" · ".join(area_labels) or "No especificadas"}\n'
        f'⚡ *Prioridad:* {datos.get("prioridad", "media")}\n\n'
        f'📦 *Servicios detectados:*\n{srv_str}\n\n'
        f'💰 *Valor cotizado:* {valor}\n'
        f'✅ *Anticipo:* {anticipo}'
        f'{falt_str}\n\n'
        f'🤖 *Confianza IA:* {conf_s} ({int(conf*100)}%)'
    )


# ── Handler: Audio de voz ────────────────────────────────────
async def handle_audio(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not db.is_authorized(update.effective_user.id):
        return  # No responde si no está autorizado (para no interferir con Hermes)

    msg = await update.message.reply_text(
        '🎙️ Procesando tu audio...\n\n_Transcribiendo con Whisper..._',
        parse_mode='Markdown'
    )

    try:
        # Descargar audio
        voice  = update.message.voice
        file   = await context.bot.get_file(voice.file_id)
        audio_bytes = await file.download_as_bytearray()

        await msg.edit_text(
            '🎙️ Procesando tu audio...\n\n✅ Audio recibido\n_🧠 Extrayendo información..._',
            parse_mode='Markdown'
        )

        # Transcribir
        transcripcion = await ia.transcribir_audio(bytes(audio_bytes))

        # Extraer datos
        areas = db.get_areas()
        datos = await ia.extraer_solicitud(transcripcion, areas)

        # Guardar en contexto para confirmación
        context.user_data['gestion_pending'] = datos
        context.user_data['gestion_areas']   = areas

        # Mostrar resumen + botones
        resumen = formato_resumen(datos, areas)
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton('✅ Confirmar solicitud', callback_data='gestion_confirm')],
            [InlineKeyboardButton('❌ Cancelar', callback_data='gestion_cancel')],
        ])
        await msg.edit_text(resumen + '\n\n¿Confirmas la solicitud?', parse_mode='Markdown', reply_markup=keyboard)

        # Mostrar transcripción separada
        await update.message.reply_text(
            f'💬 *Transcripción:*\n\n_{transcripcion}_',
            parse_mode='Markdown'
        )

    except Exception as e:
        logger.error(f'Error procesando audio gestion: {e}')
        await msg.edit_text(
            f'❌ Error al procesar el audio: {e}\n\nIntenta de nuevo o usa /gestion\\_nueva',
            parse_mode='Markdown'
        )


# ── Handler: Confirmar solicitud ───────────────────────────────
async def callback_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer()
    datos = context.user_data.get('gestion_pending')
    if not datos:
        await update.callback_query.edit_message_text('❌ Sesión expirada. Envía el audio de nuevo.')
        return
    try:
        sol = db.crear_solicitud(datos, update.effective_user)
        context.user_data.pop('gestion_pending', None)
        await update.callback_query.edit_message_text(
            f'✅ *¡Solicitud creada!*\n\n'
            f'🎫 *Ticket:* `{sol["ticketId"]}`\n'
            f'📋 *Proyecto:* {sol["titulo"]}\n'
            f'👤 *Cliente:* {sol["cliente"]}\n'
            f'📅 *Fecha:* {sol["fechaEvento"] or "Sin especificar"}\n\n'
            f'Usa /gestion\\_estado `{sol["ticketId"]}` para hacer seguimiento.',
            parse_mode='Markdown'
        )
    except Exception as e:
        await update.callback_query.edit_message_text(f'❌ Error: {e}')


async def callback_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer('Cancelado')
    context.user_data.pop('gestion_pending', None)
    await update.callback_query.edit_message_text('❌ Solicitud cancelada.')


# ── Comandos de texto ──────────────────────────────────────────────
async def cmd_estado(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not db.is_authorized(update.effective_user.id): return
    args = context.args
    if not args:
        await update.message.reply_text('Uso: /gestion_estado SOL-2026-001')
        return
    ticket = args[0].upper()
    sol = db.get_solicitud_por_ticket(ticket)
    if not sol:
        await update.message.reply_text(f'❌ Ticket `{ticket}` no encontrado.', parse_mode='Markdown')
        return
    areas_str = ', '.join(sol.get('areas', []))
    await update.message.reply_text(
        f'🔍 *{sol["ticketId"]}*\n\n'
        f'📋 {sol["titulo"]}\n'
        f'👤 {sol["cliente"]}\n'
        f'📅 Evento: {sol.get("fechaEvento") or "—"}\n'
        f'📊 Estado: {ESTADO_LABELS.get(sol["estado"], sol["estado"])}\n'
        f'⚡ Prioridad: {sol.get("prioridad", "media")}\n'
        f'🏢 Áreas: {areas_str or "—"}',
        parse_mode='Markdown'
    )


async def cmd_proyectos(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not db.is_authorized(update.effective_user.id): return
    try:
        proyectos = db.get_solicitudes_activas(10)
        if not proyectos:
            await update.message.reply_text('✅ No hay proyectos activos.')
            return
        lista = '\n\n'.join(
            f'• `{s["ticketId"]}` — {s["titulo"]}\n  👤 {s["cliente"]} | 📅 {s.get("fechaEvento") or "—"}'
            for s in proyectos
        )
        await update.message.reply_text(f'📂 *Proyectos Activos*\n\n{lista}', parse_mode='Markdown')
    except Exception as e:
        await update.message.reply_text(f'❌ Error: {e}')


async def cmd_vigentes(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not db.is_authorized(update.effective_user.id): return
    try:
        entregas = db.get_entregas_proximas(7)
        if not entregas:
            await update.message.reply_text('✅ Sin entregas en los próximos 7 días 🎉')
            return
        filas = []
        for e in entregas[:8]:
            from datetime import datetime
            try:
                diff = (datetime.fromisoformat(e['fechaEntrega']) - datetime.utcnow()).days
            except Exception:
                diff = 99
            emoji = '🔴' if diff <= 0 else '🟠' if diff <= 3 else '🟡' if diff <= 7 else '🟢'
            filas.append(f"{emoji} *{e['nombre']}* ({e['cantidad']} {e['unidad']})\n  📁 {e['proyecto']} · 📅 {e['fechaEntrega']}")
        await update.message.reply_text(
            f'📅 *Entregas próximas (7 días)*\n\n' + '\n\n'.join(filas),
            parse_mode='Markdown'
        )
    except Exception as e:
        await update.message.reply_text(f'❌ Error: {e}')


async def cmd_ayuda_gestion(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not db.is_authorized(update.effective_user.id): return
    await update.message.reply_text(
        '🏆 *Gestión Deportiva — Comandos*\n\n'
        '🎙️ *Audio de voz* → Crear solicitud automáticamente con IA\n'
        '/gestion\\_estado \\[ticket\\] → Ver estado de un ticket\n'
        '/gestion\\_proyectos → Proyectos activos\n'
        '/gestion\\_vigentes → Entregas en 7 días\n'
        '/gestion\\_ayuda → Esta ayuda',
        parse_mode='MarkdownV2'
    )
