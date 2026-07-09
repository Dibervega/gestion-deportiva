# ============================================================
# CONFIG.PY — Configuración del Módulo Gestión Deportiva
# Adaptado para usar DeepSeek (texto) + Groq Whisper (audio)
# ============================================================
import os
from dotenv import load_dotenv

load_dotenv()

# ── DeepSeek (ya configurado en Hermes) ──────────────────────
# Si Hermes ya tiene DEEPSEEK_API_KEY en su .env, se reutiliza automáticamente
DEEPSEEK_API_KEY  = os.getenv('DEEPSEEK_API_KEY', '')
DEEPSEEK_BASE_URL = os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
DEEPSEEK_MODEL    = os.getenv('DEEPSEEK_MODEL', 'deepseek-chat')

# ── Groq Whisper (para transcripción de audio — GRATIS) ──────
# Crear cuenta gratuita en: https://console.groq.com
# Plan gratuito: 2000 minutos/día — más que suficiente para 15 personas
GROQ_API_KEY   = os.getenv('GROQ_API_KEY', '')
GROQ_BASE_URL  = 'https://api.groq.com/openai/v1'
GROQ_MODEL_STT = 'whisper-large-v3-turbo'   # Más rápido y preciso en español

# ── Firebase ──────────────────────────────────────────────────
FIREBASE_CRED_PATH = os.getenv('FIREBASE_CRED_PATH', 'firebase-credentials.json')
FIREBASE_PROJECT   = os.getenv('FIREBASE_PROJECT_ID', '')

# ── Autorizados (IDs de Telegram de admins) ───────────────────
ADMIN_TELEGRAM_IDS = [
    int(x) for x in os.getenv('ADMIN_TELEGRAM_IDS', '').split(',') if x.strip()
]

# ── Colecciones Firestore ─────────────────────────────────────
BOT_USERS_COLLECTION       = 'bot_users'
SOLICITUDES_COLLECTION     = 'solicitudes'
NOTIFICACIONES_COLLECTION  = 'notificaciones'

# ── Áreas por defecto ─────────────────────────────────────────
DEFAULT_AREAS = [
    {'id': 'cronometraje',   'nombre': 'Cronometraje',   'emoji': '⏱️'},
    {'id': 'medalleria',     'nombre': 'Medallería',     'emoji': '🏅'},
    {'id': 'fotografia',     'nombre': 'Fotografía',     'emoji': '📸'},
    {'id': 'diseno',         'nombre': 'Diseño',         'emoji': '🎨'},
    {'id': 'administrativa', 'nombre': 'Administrativa', 'emoji': '📋'},
    {'id': 'permisos',       'nombre': 'Permisos',       'emoji': '📜'},
]
