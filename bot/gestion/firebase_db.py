# ============================================================
# FIREBASE_DB.PY — Acceso a Firestore
# ============================================================
import firebase_admin
from firebase_admin import credentials, firestore
import random, string
from datetime import datetime
from .config import FIREBASE_CRED_PATH, FIREBASE_PROJECT, BOT_USERS_COLLECTION, SOLICITUDES_COLLECTION, NOTIFICACIONES_COLLECTION, DEFAULT_AREAS

_db = None

def get_db():
    global _db
    if _db is None:
        # Si Firebase ya fue inicializado por Hermes, reutilizamos la app existente
        try:
            app = firebase_admin.get_app('gestion')
        except ValueError:
            cred = credentials.Certificate(FIREBASE_CRED_PATH)
            app  = firebase_admin.initialize_app(cred, name='gestion')
        _db = firestore.client(app=app)
    return _db


def generate_id(length=10):
    chars = string.ascii_lowercase + string.digits
    return ''.join(random.choices(chars, k=length))


def generate_ticket():
    year = datetime.now().year
    num  = random.randint(100, 999)
    return f'SOL-{year}-{num}'


# ── Autorización ──────────────────────────────────────────────
def is_authorized(telegram_id: int) -> bool:
    """Verifica si el usuario está autorizado en el sistema."""
    db = get_db()
    doc = db.collection(BOT_USERS_COLLECTION).document(str(telegram_id)).get()
    if doc.exists:
        data = doc.to_dict()
        return data.get('activo', True) is not False
    return False


# ── Áreas ────────────────────────────────────────────────
def get_areas() -> list:
    """Obtiene las áreas dinámicamente desde Firestore (o usa las por defecto)."""
    try:
        db  = get_db()
        doc = db.collection('config').document('areas').get()
        if doc.exists:
            return doc.to_dict().get('lista', DEFAULT_AREAS)
    except Exception:
        pass
    return DEFAULT_AREAS


# ── Solicitudes ──────────────────────────────────────────────
def crear_solicitud(datos: dict, telegram_user) -> dict:
    """Guarda una nueva solicitud en Firestore."""
    db      = get_db()
    sol_id  = generate_id()
    ticket  = generate_ticket()
    now_iso = datetime.utcnow().isoformat() + 'Z'

    solicitud = {
        'id':        sol_id,
        'ticketId':  ticket,
        'titulo':    datos.get('titulo', 'Sin título'),
        'cliente':   datos.get('cliente', 'Sin especificar'),
        'areas':     datos.get('areas', []),
        'estado':    'pendiente',
        'prioridad': datos.get('prioridad', 'media'),
        'descripcion': datos.get('descripcion', ''),
        'fechaEvento': datos.get('fechaEvento', ''),
        'contacto':  datos.get('contacto', ''),
        'notas':     datos.get('notas', ''),
        'asignadoA': None,
        'creadoPor': f'telegram:{telegram_user.id}',
        'creadoViaTelegram': True,
        'telegramUserId':   str(telegram_user.id),
        'telegramUserName': getattr(telegram_user, 'username', '') or telegram_user.first_name,
        'createdAt': now_iso,
        'updatedAt': now_iso,
        'historial': [{
            'estado':  'pendiente',
            'fecha':   now_iso,
            'usuario': f'telegram:{telegram_user.id}',
            'nota':    f'Creada vía Telegram por {telegram_user.first_name} (audio procesado con IA)',
        }],
        'servicios': [
            {
                'id':           generate_id(),
                'area':         s.get('area', ''),
                'nombre':       s.get('nombre', ''),
                'descripcion':  s.get('descripcion', ''),
                'cantidad':     float(s.get('cantidad', 0)),
                'unidad':       s.get('unidad', 'unidades'),
                'precioUnitario': 0,
                'precioTotal':  0,
                'fechaEntrega': '',
                'responsable':  '',
                'estado':       'pendiente',
                'notas':        '',
                'creadoEn':     now_iso,
            }
            for s in datos.get('servicios', [])
        ],
        'cierreEvento': None,
        'financiero': {
            'valorCotizado': float(datos.get('financiero', {}).get('valorCotizado', 0)),
            'anticipo':      float(datos.get('financiero', {}).get('anticipo', 0)),
            'estadoPago':    datos.get('financiero', {}).get('estadoPago', 'sin_pago'),
            'gastos':        [],
            'comisiones':    [],
        },
    }

    db.collection(SOLICITUDES_COLLECTION).document(sol_id).set(solicitud)

    # Notificación
    db.collection(NOTIFICACIONES_COLLECTION).add({
        'tipo':     'nueva_solicitud',
        'mensaje':  f'Nueva solicitud: {solicitud["titulo"]}',
        'ticketId': ticket,
        'solId':    sol_id,
        'leida':    False,
        'creadaEn': now_iso,
        'origen':   'telegram',
    })

    return solicitud


def get_solicitud_por_ticket(ticket: str) -> dict | None:
    db   = get_db()
    docs = db.collection(SOLICITUDES_COLLECTION).where('ticketId', '==', ticket.upper()).limit(1).stream()
    for doc in docs:
        return doc.to_dict()
    return None


def get_solicitudes_activas(limit=10) -> list:
    db = get_db()
    docs = (
        db.collection(SOLICITUDES_COLLECTION)
        .where('estado', 'not-in', ['completado', 'cancelado'])
        .order_by('estado')
        .order_by('createdAt', direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    return [d.to_dict() for d in docs]


def get_entregas_proximas(dias=7) -> list:
    """Retorna servicios con fechaEntrega en los próximos N días."""
    from datetime import timedelta
    hoy   = datetime.utcnow().date()
    hasta = hoy + timedelta(days=dias)
    hoy_s  = hoy.isoformat()
    hasta_s = hasta.isoformat()

    db   = get_db()
    docs = db.collection(SOLICITUDES_COLLECTION).stream()
    entregas = []
    for doc in docs:
        sol = doc.to_dict()
        if sol.get('estado') in ('completado', 'cancelado'):
            continue
        for srv in sol.get('servicios', []):
            fe = srv.get('fechaEntrega', '')
            if fe and hoy_s <= fe <= hasta_s and srv.get('estado') != 'entregado':
                entregas.append({
                    **srv,
                    'proyecto': sol.get('titulo', ''),
                    'ticket':   sol.get('ticketId', ''),
                })
    entregas.sort(key=lambda x: x.get('fechaEntrega', ''))
    return entregas
