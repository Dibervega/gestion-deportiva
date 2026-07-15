// ============================================================
// BOT DE TELEGRAM — Gestión Aire Libre y Aventura
// Procesa audios, crea solicitudes con IA y sincroniza Firebase
// ============================================================

const { Telegraf, Markup, session } = require('telegraf');
const { message } = require('telegraf/filters');
const admin = require('firebase-admin');
const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

// ── Inicializar Firebase ──────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Inicializar OpenAI ────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Inicializar Bot ───────────────────────────────────────────
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.use(session());

// ── Usuarios autorizados (IDs de Telegram) ────────────────────
// Cargar desde Firestore dinámicamente
async function isAuthorized(telegramId) {
  const snap = await db.collection('bot_users').doc(String(telegramId)).get();
  return snap.exists && snap.data()?.activo !== false;
}

// ── Helpers ───────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function generateTicketId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900) + 100;
  return `SOL-${year}-${rand}`;
}

async function getAreas() {
  const snap = await db.collection('config').doc('areas').get();
  return snap.exists ? (snap.data()?.lista || DEFAULT_AREAS) : DEFAULT_AREAS;
}

async function getUsers() {
  const snap = await db.collection('usuarios').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

const DEFAULT_AREAS = [
  { id: 'cronometraje', nombre: 'Cronometraje',  emoji: '⏱️' },
  { id: 'medalleria',   nombre: 'Medallería',    emoji: '🏅' },
  { id: 'fotografía',   nombre: 'Fotografía',    emoji: '📸' },
  { id: 'diseño',       nombre: 'Diseño',        emoji: '🎨' },
  { id: 'administrativa',nombre:'Administrativa', emoji: '📋' },
  { id: 'permisos',     nombre: 'Permisos',      emoji: '📜' },
];

// ── PASO 1: Transcripción de audio con Whisper ────────────────
async function transcribeAudio(fileBuffer, filename = 'audio.ogg') {
  const tmpPath = path.join(os.tmpdir(), filename);
  fs.writeFileSync(tmpPath, fileBuffer);

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(tmpPath),
    model: 'whisper-1',
    language: 'es',
    response_format: 'text',
  });

  fs.unlinkSync(tmpPath);
  return transcription;
}

// ── PASO 2: Extracción de datos con GPT-4o ────────────────────
async function extractSolicitudFromText(texto, areas) {
  const areasStr = areas.map(a => `${a.id} = "${a.nombre}"`).join(', ');

  const prompt = `Eres un asistente de gestión de eventos deportivos. Extrae información de solicitudes.

Áreas disponibles en el sistema: ${areasStr}

A partir del siguiente texto transcrito, extrae los datos para crear una solicitud de evento.
Devuelve ÚNICAMENTE un JSON válido con este formato exacto:

{
  "titulo": "Nombre descriptivo del evento",
  "cliente": "Nombre del cliente o empresa",
  "fechaEvento": "YYYY-MM-DD o null si no se menciona",
  "areas": ["id_area1", "id_area2"],
  "descripcion": "Descripción general del evento",
  "prioridad": "alta|media|baja",
  "contacto": "Teléfono o email si se menciona, o ''",
  "notas": "Notas adicionales importantes",
  "servicios": [
    {
      "nombre": "Nombre del servicio",
      "area": "id_area",
      "cantidad": 0,
      "unidad": "unidades|participantes|horas|metros",
      "descripcion": "Descripción del servicio"
    }
  ],
  "financiero": {
    "valorCotizado": 0,
    "anticipo": 0,
    "estadoPago": "sin_pago|parcial|pagado"
  },
  "confianza": 0.85,
  "camposFaltantes": ["campo que no se pudo extraer"]
}

Texto a procesar:
"${texto}"

Reglas:
- Si no se menciona fecha, usa null
- Si no se menciona monto, usa 0
- Detecta el área según contexto (cronometraje=tiempo/participantes, medallería=medallas/trofeos, fotografía=fotos/video, diseño=logos/material, permisos=permisos/licencias)
- Campos camposFaltantes: lista los campos importantes que no se pudieron extraer
- confianza: número entre 0 y 1 indicando qué tan seguro estás de la extracción`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  return JSON.parse(response.choices[0].message.content);
}

// ── PASO 3: Guardar en Firebase ───────────────────────────────
async function guardarSolicitud(datos, telegramUser) {
  const ticket = generateTicketId();
  const id = generateId();
  const now = new Date().toISOString();

  const solicitud = {
    id,
    ticketId: ticket,
    titulo: datos.titulo || 'Sin título',
    cliente: datos.cliente || 'Sin especificar',
    areas: datos.areas || [],
    estado: 'pendiente',
    prioridad: datos.prioridad || 'media',
    descripcion: datos.descripcion || '',
    fechaEvento: datos.fechaEvento || '',
    contacto: datos.contacto || '',
    notas: datos.notas || '',
    asignadoA: null,
    creadoPor: `telegram:${telegramUser.id}`,
    creadoViaTelegram: true,
    telegramUserId: telegramUser.id,
    telegramUserName: telegramUser.username || telegramUser.first_name,
    createdAt: now,
    updatedAt: now,
    historial: [{
      estado: 'pendiente',
      fecha: now,
      usuario: `telegram:${telegramUser.id}`,
      nota: `Creada vía Telegram por ${telegramUser.first_name} (audio procesado con IA)`,
    }],
    servicios: (datos.servicios || []).map(s => ({
      id: generateId(),
      area: s.area || '',
      nombre: s.nombre || '',
      descripcion: s.descripcion || '',
      cantidad: parseFloat(s.cantidad) || 0,
      unidad: s.unidad || 'unidades',
      precioUnitario: 0,
      precioTotal: 0,
      fechaEntrega: '',
      responsable: '',
      estado: 'pendiente',
      notas: '',
      creadoEn: now,
    })),
    cierreEvento: null,
    financiero: {
      valorCotizado: parseFloat(datos.financiero?.valorCotizado) || 0,
      anticipo: parseFloat(datos.financiero?.anticipo) || 0,
      estadoPago: datos.financiero?.estadoPago || 'sin_pago',
      gastos: [],
      comisiones: [],
    },
  };

  await db.collection('solicitudes').doc(id).set(solicitud);

  // Notificación a las áreas involucradas
  await db.collection('notificaciones').add({
    tipo: 'nueva_solicitud',
    mensaje: `Nueva solicitud: ${solicitud.titulo}`,
    ticketId: ticket,
    solId: id,
    leida: false,
    creadaEn: now,
    origen: 'telegram',
  });

  return solicitud;
}

// ── Formatear resumen para Telegram ──────────────────────────
function formatResumen(datos, areas) {
  const areaLabels = (datos.areas || []).map(aId => {
    const a = areas.find(x => x.id === aId);
    return a ? `${a.emoji} ${a.nombre}` : aId;
  }).join(' · ');

  const serviciosStr = (datos.servicios || []).slice(0, 5).map(s =>
    `  • ${s.nombre}${s.cantidad ? ` (${s.cantidad} ${s.unidad})` : ''}`
  ).join('\n');

  const valor    = datos.financiero?.valorCotizado ? `$${Number(datos.financiero.valorCotizado).toLocaleString('es-CO')}` : 'No especificado';
  const anticipo = datos.financiero?.anticipo > 0 ? `$${Number(datos.financiero.anticipo).toLocaleString('es-CO')}` : '—';

  const confianza = datos.confianza >= 0.9 ? '🟢 Alta' : datos.confianza >= 0.7 ? '🟡 Media' : '🔴 Baja';
  const faltantes = datos.camposFaltantes?.length ? `\n⚠️ *Sin especificar:* ${datos.camposFaltantes.join(', ')}` : '';

  return `📋 *Resumen de la Solicitud*

📌 *Proyecto:* ${datos.titulo || '—'}
👤 *Cliente:* ${datos.cliente || '—'}
📅 *Fecha del evento:* ${datos.fechaEvento ? new Date(datos.fechaEvento + 'T12:00:00').toLocaleDateString('es-CO', { day:'numeric', month:'long', year:'numeric' }) : 'No especificada'}
🏢 *Áreas:* ${areaLabels || 'No especificadas'}
⚡ *Prioridad:* ${datos.prioridad || 'media'}

📦 *Servicios detectados:*
${serviciosStr || '  (ninguno detectado)'}

💰 *Valor cotizado:* ${valor}
✅ *Anticipo:* ${anticipo}
${datos.descripcion ? `\n📝 *Descripción:* ${datos.descripcion}` : ''}
${faltantes}

🤖 *Confianza de extracción:* ${confianza} (${Math.round((datos.confianza || 0) * 100)}%)`;
}

// ── COMANDO /start ─────────────────────────────────────────────
bot.start(async (ctx) => {
  const authorized = await isAuthorized(ctx.from.id);
  if (!authorized) {
    return ctx.reply(
      `❌ No estás autorizado para usar este bot.\n\nContacta al administrador del sistema para solicitar acceso.\nTu ID de Telegram es: \`${ctx.from.id}\``,
      { parse_mode: 'Markdown' }
    );
  }

  await ctx.reply(
    `👋 ¡Hola, ${ctx.from.first_name}!\n\n` +
    `Soy el asistente de *Gestión Aire Libre y Aventura* 🏆\n\n` +
    `Puedes crearme solicitudes de evento simplemente enviando un 🎙️ *audio de voz* describiendo el evento.\n\n` +
    `*Comandos disponibles:*\n` +
    `🎙️ Audio → Crear solicitud automáticamente\n` +
    `📋 /nueva → Crear solicitud paso a paso\n` +
    `📂 /mis\\_proyectos → Ver proyectos activos\n` +
    `🔍 /estado → Consultar un ticket\n` +
    `📅 /vigentes → Entregas próximas\n` +
    `❓ /ayuda → Ver todos los comandos`,
    { parse_mode: 'Markdown' }
  );
});

// ── PROCESAMIENTO DE AUDIO (corazón del bot) ──────────────────
bot.on(message('voice'), async (ctx) => {
  const authorized = await isAuthorized(ctx.from.id);
  if (!authorized) return ctx.reply('❌ No estás autorizado.');

  const processingMsg = await ctx.reply('🎙️ Procesando tu audio...\n\n_Transcribiendo con IA..._', { parse_mode: 'Markdown' });

  try {
    // 1. Descargar audio de Telegram
    const fileId  = ctx.message.voice.file_id;
    const fileRef = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileRef.file_path}`;
    const audioRes = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const audioBuffer = Buffer.from(audioRes.data);

    // 2. Transcribir con Whisper
    await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, undefined,
      '🎙️ Procesando tu audio...\n\n✅ Audio recibido\n_🧠 Extrayendo información con IA..._', { parse_mode: 'Markdown' });

    const transcripcion = await transcribeAudio(audioBuffer, `audio_${ctx.from.id}.ogg`);

    // 3. Extraer datos con GPT-4o
    const areas = await getAreas();
    const datos = await extractSolicitudFromText(transcripcion, areas);

    // 4. Guardar sesión del usuario
    ctx.session = ctx.session || {};
    ctx.session.pendingDatos = datos;
    ctx.session.transcripcion = transcripcion;

    // 5. Mostrar resumen y pedir confirmación
    const resumen = formatResumen(datos, areas);
    await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, undefined,
      resumen + '\n\n¿Confirmas la solicitud?',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Confirmar', 'confirm_solicitud'),
            Markup.button.callback('✏️ Editar', 'edit_solicitud'),
          ],
          [Markup.button.callback('❌ Cancelar', 'cancel_solicitud')],
        ]),
      }
    );

    // Mostrar transcripción por separado
    await ctx.reply(
      `💬 *Transcripción de tu audio:*\n\n_"${transcripcion}"_`,
      { parse_mode: 'Markdown' }
    );

  } catch (err) {
    console.error('Error procesando audio:', err);
    await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, undefined,
      `❌ Ocurrió un error procesando el audio: ${err.message}\n\nIntenta de nuevo o usa /nueva para crear manualmente.`
    );
  }
});

// ── CONFIRMACIÓN ──────────────────────────────────────────────
bot.action('confirm_solicitud', async (ctx) => {
  await ctx.answerCbQuery();
  const datos = ctx.session?.pendingDatos;
  if (!datos) return ctx.reply('❌ Sesión expirada. Envía el audio de nuevo.');

  try {
    const sol = await guardarSolicitud(datos, ctx.from);
    ctx.session.pendingDatos = null;

    await ctx.editMessageText(
      `✅ *¡Solicitud creada exitosamente!*\n\n` +
      `🎫 *Ticket:* \`${sol.ticketId}\`\n` +
      `📋 *Proyecto:* ${sol.titulo}\n` +
      `👤 *Cliente:* ${sol.cliente}\n` +
      `📅 *Fecha:* ${sol.fechaEvento || 'Sin especificar'}\n\n` +
      `Las áreas involucradas han sido notificadas.\n` +
      `Puedes hacer seguimiento con /estado \`${sol.ticketId}\``,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    await ctx.reply(`❌ Error guardando la solicitud: ${err.message}`);
  }
});

bot.action('cancel_solicitud', async (ctx) => {
  await ctx.answerCbQuery('Cancelado');
  ctx.session = ctx.session || {};
  ctx.session.pendingDatos = null;
  await ctx.editMessageText('❌ Solicitud cancelada. Puedes enviar un nuevo audio cuando quieras.');
});

bot.action('edit_solicitud', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    '✏️ Para editar, ve al sistema web y busca la solicitud, o envía un nuevo audio con la información corregida.\n\nSi quieres completarla manualmente, usa /nueva'
  );
});

// ── COMANDO /nueva (paso a paso) ──────────────────────────────
bot.command('nueva', async (ctx) => {
  const authorized = await isAuthorized(ctx.from.id);
  if (!authorized) return ctx.reply('❌ No autorizado.');

  ctx.session = { step: 'titulo', form: {} };
  await ctx.reply(
    '📋 *Crear Nueva Solicitud*\n\nPaso 1/5 — ¿Cuál es el nombre del evento o proyecto?',
    { parse_mode: 'Markdown' }
  );
});

// ── COMANDO /estado ───────────────────────────────────────────
bot.command('estado', async (ctx) => {
  const authorized = await isAuthorized(ctx.from.id);
  if (!authorized) return ctx.reply('❌ No autorizado.');

  const args = ctx.message.text.split(' ').slice(1);
  const ticket = args[0]?.toUpperCase();

  if (!ticket) {
    return ctx.reply('Uso: /estado SOL-2026-001');
  }

  try {
    const snap = await db.collection('solicitudes').where('ticketId', '==', ticket).limit(1).get();
    if (snap.empty) return ctx.reply(`❌ No se encontró el ticket \`${ticket}\``, { parse_mode: 'Markdown' });

    const sol = snap.docs[0].data();
    const ESTADO_LABELS = {
      pendiente: '⏳ Pendiente', en_proceso: '🔄 En Proceso',
      revision: '👁️ En Revisión', aprobado: '✅ Aprobado',
      completado: '🏁 Completado', cancelado: '❌ Cancelado',
    };

    await ctx.reply(
      `🔍 *${sol.ticketId}*\n\n` +
      `📋 ${sol.titulo}\n` +
      `👤 Cliente: ${sol.cliente}\n` +
      `📅 Evento: ${sol.fechaEvento || '—'}\n` +
      `📊 Estado: ${ESTADO_LABELS[sol.estado] || sol.estado}\n` +
      `⚡ Prioridad: ${sol.prioridad}\n` +
      `🏢 Áreas: ${(sol.areas||[]).join(', ')}`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    await ctx.reply(`❌ Error: ${err.message}`);
  }
});

// ── COMANDO /mis_proyectos ────────────────────────────────────
bot.command('mis_proyectos', async (ctx) => {
  const authorized = await isAuthorized(ctx.from.id);
  if (!authorized) return ctx.reply('❌ No autorizado.');

  try {
    const snap = await db.collection('solicitudes')
      .where('estado', 'not-in', ['completado', 'cancelado'])
      .orderBy('estado')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    if (snap.empty) return ctx.reply('✅ No hay proyectos activos en este momento.');

    const proyectos = snap.docs.map(d => d.data());
    const lista = proyectos.map(sol =>
      `• \`${sol.ticketId}\` — ${sol.titulo}\n  👤 ${sol.cliente} | 📅 ${sol.fechaEvento || '—'}`
    ).join('\n\n');

    await ctx.reply(`📂 *Proyectos Activos (${proyectos.length})*\n\n${lista}`, { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply(`❌ Error: ${err.message}`);
  }
});

// ── COMANDO /vigentes ─────────────────────────────────────────
bot.command('vigentes', async (ctx) => {
  const authorized = await isAuthorized(ctx.from.id);
  if (!authorized) return ctx.reply('❌ No autorizado.');

  try {
    const hoy   = new Date().toISOString().split('T')[0];
    const en7   = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const snap = await db.collection('solicitudes').get();
    const entregas = [];

    snap.docs.forEach(d => {
      const sol = d.data();
      if (['completado','cancelado'].includes(sol.estado)) return;
      (sol.servicios || []).forEach(srv => {
        if (srv.fechaEntrega && srv.fechaEntrega >= hoy && srv.fechaEntrega <= en7 && srv.estado !== 'entregado') {
          entregas.push({ ...srv, proyecto: sol.titulo, ticket: sol.ticketId });
        }
      });
    });

    if (!entregas.length) return ctx.reply('✅ Sin entregas en los próximos 7 días 🎉');

    entregas.sort((a,b) => a.fechaEntrega.localeCompare(b.fechaEntrega));
    const lista = entregas.slice(0, 8).map(e => {
      const diff = Math.ceil((new Date(e.fechaEntrega) - new Date()) / 86400000);
      const emoji = diff <= 0 ? '🔴' : diff <= 3 ? '🟠' : diff <= 7 ? '🟡' : '🟢';
      return `${emoji} *${e.nombre}* (${e.cantidad} ${e.unidad})\n  📁 ${e.proyecto} · 📅 ${e.fechaEntrega}`;
    }).join('\n\n');

    await ctx.reply(`📅 *Entregas próximas (7 días)*\n\n${lista}`, { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply(`❌ Error: ${err.message}`);
  }
});

// ── COMANDO /ayuda ────────────────────────────────────────────
bot.command('ayuda', async (ctx) => {
  await ctx.reply(
    `🤖 *Comandos disponibles:*\n\n` +
    `🎙️ *Audio de voz* → Crear solicitud automáticamente con IA\n\n` +
    `📋 /nueva → Crear solicitud paso a paso (texto)\n` +
    `🔍 /estado \\[ticket\\] → Consultar estado de un ticket\n` +
    `📂 /mis\\_proyectos → Ver proyectos activos\n` +
    `📅 /vigentes → Entregas en los próximos 7 días\n` +
    `❓ /ayuda → Esta ayuda\n\n` +
    `💡 *Tip:* Para mejores resultados al grabar un audio, incluye:\n` +
    `• Nombre del cliente\n• Fecha del evento\n• Áreas requeridas\n• Servicios y cantidades\n• Valor aproximado`,
    { parse_mode: 'MarkdownV2' }
  );
});

// ── Texto libre (flujo paso a paso de /nueva) ─────────────────
bot.on(message('text'), async (ctx) => {
  const authorized = await isAuthorized(ctx.from.id);
  if (!authorized) return;

  const session = ctx.session;
  if (!session?.step) return; // No hay flujo activo

  const text = ctx.message.text.trim();
  session.form = session.form || {};

  switch (session.step) {
    case 'titulo':
      session.form.titulo = text;
      session.step = 'cliente';
      await ctx.reply('Paso 2/5 — ¿Nombre del cliente o empresa?');
      break;
    case 'cliente':
      session.form.cliente = text;
      session.step = 'fecha';
      await ctx.reply('Paso 3/5 — ¿Fecha del evento? (ej: 2026-08-20 o "no definida")');
      break;
    case 'fecha':
      session.form.fechaEvento = text.toLowerCase().includes('no') ? null : text;
      session.step = 'descripcion';
      await ctx.reply('Paso 4/5 — Describe brevemente los servicios que necesitan:');
      break;
    case 'descripcion':
      session.form.descripcion = text;
      session.step = 'confirm_manual';
      const areas = await getAreas();
      session.pendingDatos = {
        ...session.form,
        areas: [], servicios: [], financiero: { valorCotizado: 0, anticipo: 0, estadoPago: 'sin_pago' },
        prioridad: 'media', confianza: 1, camposFaltantes: ['áreas', 'servicios', 'valor'],
      };
      await ctx.reply(
        formatResumen(session.pendingDatos, areas) + '\n\n¿Confirmas?',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Confirmar', 'confirm_solicitud')],
            [Markup.button.callback('❌ Cancelar', 'cancel_solicitud')],
          ]),
        }
      );
      break;
  }
});

// ── Iniciar el bot ────────────────────────────────────────────
console.log('🤖 Bot de Gestión Aire Libre y Aventura iniciando...');
bot.launch().then(() => {
  console.log('✅ Bot activo y escuchando');
}).catch(err => {
  console.error('❌ Error iniciando bot:', err);
  process.exit(1);
});

// Graceful shutdown
process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
