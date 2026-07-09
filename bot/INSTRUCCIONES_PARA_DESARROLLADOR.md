# 📋 Briefing para el Asistente del Bot Hermes
## Integración del Módulo de Gestión Deportiva

---

## 1. CONTEXTO DEL PROYECTO

Tenemos una empresa de servicios deportivos con áreas como:
- ⏱️ Cronometraje
- 🏅 Medallería
- 📸 Fotografía
- 🎨 Diseño
- 📋 Administrativa
- 📜 Permisos

Actualmente gestionamos todas las solicitudes de clientes en Excel de forma manual.
Construimos un **sistema web de gestión** (en `C:\Users\DIBER VEGA\Desktop\GESTION\`) que digitaliza todo esto.

**El objetivo de esta tarea:** que el bot **Hermes** pueda recibir un **audio de voz** de cualquiera de los 3-4 colaboradores autorizados, transcribirlo automáticamente, extraer todos los datos del evento con IA, y crear la solicitud directamente en el sistema — sin que nadie tenga que escribir nada.

---

## 2. LO QUE HERMES DEBE HACER (NUEVO)

Cuando un colaborador autorizado envíe un **audio de voz** al bot:

```
1. Hermes recibe el audio
2. Groq Whisper transcribe el audio a texto (en español)
3. DeepSeek analiza el texto y extrae:
   → Nombre del cliente, fecha del evento, áreas requeridas,
     servicios solicitados, cantidades, valor cotizado, anticipo
4. El bot muestra un resumen y pide confirmación
5. El colaborador confirma → la solicitud se guarda en Firebase Firestore
6. El sistema web se actualiza en tiempo real
```

**Comandos nuevos que tendrá Hermes:**

| Comando | Función |
|---------|---------|
| 🎙️ Audio de voz | Crear solicitud automáticamente |
| `/gestion_estado SOL-2026-001` | Ver estado de un ticket |
| `/gestion_proyectos` | Ver proyectos activos |
| `/gestion_vigentes` | Ver entregas en los próximos 7 días |
| `/gestion_ayuda` | Ver comandos disponibles |

> ⚠️ Todos los comandos usan el prefijo `/gestion_` para **no interferir** con los comandos actuales de Hermes.

---

## 3. STACK TECNOLÓGICO

| Componente | Herramienta | Notas |
|-----------|-------------|-------|
| Extracción de datos (IA) | **DeepSeek** (`deepseek-chat`) | Ya configurado en Hermes |
| Transcripción de audio | **Groq Whisper** (`whisper-large-v3-turbo`) | GRATIS — 2000 min/día |
| Base de datos | **Firebase Firestore** | Necesita configuración |
| Bot | **python-telegram-bot v20+** | Ya en Hermes |
| SDK | `openai` Python SDK | Funciona para DeepSeek Y Groq |

> **¿Por qué Groq?** DeepSeek no tiene API de transcripción de voz. Groq tiene Whisper gratuito y usa el mismo SDK de OpenAI — solo cambia la URL base.

---

## 4. ARCHIVOS A SUBIR AL VPS

Hay una carpeta llamada `gestion/` con estos archivos Python listos:

```
gestion/
  ├── __init__.py       ← Punto de entrada — registra todos los handlers
  ├── config.py         ← Variables de entorno (DeepSeek, Groq, Firebase)
  ├── firebase_db.py    ← CRUD con Firestore (leer/escribir solicitudes)
  ├── ia.py             ← Groq Whisper + DeepSeek extracción de datos
  └── comandos.py       ← Handlers async de Telegram
```

**Esta carpeta debe quedar en el mismo directorio que el `main.py` del Hermes:**

```
hermes/
  ├── main.py           ← Existente — NO modificar excepto agregar 2 líneas
  ├── ... (resto de archivos del Hermes)
  └── gestion/          ← NUEVA CARPETA a subir
        ├── __init__.py
        ├── config.py
        ├── firebase_db.py
        ├── ia.py
        └── comandos.py
```

---

## 5. INSTRUCCIONES PASO A PASO

### PASO 1 — Crear cuenta gratuita en Groq (5 minutos)

1. Ir a **https://console.groq.com**
2. Crear cuenta (se puede con Google)
3. Ir a **API Keys → Create API Key**
4. Copiar la clave (empieza con `gsk_...`)

---

### PASO 2 — Configurar Firebase (si no está hecho)

1. Ir a **https://console.firebase.google.com**
2. Crear proyecto nuevo o usar uno existente
3. Ir a **Configuración del proyecto (⚙️) → Cuentas de servicio**
4. Click en **"Generar nueva clave privada"** → descarga un archivo `.json`
5. Subir ese archivo JSON al VPS (ej: `/home/hermes/firebase-credentials.json`)
6. En Firebase Console → ir a **Firestore Database → Crear base de datos**
   - Seleccionar **modo producción**
   - Seleccionar región (preferible `us-central1` o `southamerica-east1`)

---

### PASO 3 — Subir la carpeta `gestion/` al VPS

**Opción A — via SSH + SCP (desde tu máquina local):**
```bash
scp -r "C:\Users\DIBER VEGA\Desktop\GESTION\bot\gestion" usuario@ip-del-vps:/ruta/al/hermes/
```

**Opción B — via panel de Hostinger (hPanel):**
1. Abrir hPanel → File Manager
2. Navegar a la carpeta del Hermes
3. Crear carpeta `gestion`
4. Subir cada archivo uno por uno

**Opción C — via Git (si el Hermes usa repositorio):**
```bash
# Copiar la carpeta gestion/ al repo y hacer commit
git add gestion/
git commit -m "feat: integrar módulo gestión deportiva"
git push
# En el VPS:
git pull
```

---

### PASO 4 — Agregar variables de entorno

En el VPS, abrir el archivo `.env` del Hermes y agregar estas líneas al final:

```bash
# ── MÓDULO GESTIÓN DEPORTIVA ─────────────────────────────────

# DeepSeek (verificar que estas variables YA existan en el .env del Hermes)
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# Groq Whisper — NUEVO (clave creada en el Paso 1)
GROQ_API_KEY=gsk_...

# Firebase — NUEVO
FIREBASE_CRED_PATH=/ruta/completa/al/firebase-credentials.json
FIREBASE_PROJECT_ID=nombre-de-tu-proyecto-firebase

# IDs de Telegram de los administradores (separados por coma)
ADMIN_TELEGRAM_IDS=ID1,ID2,ID3
```

---

### PASO 5 — Modificar `main.py` (SOLO 2 líneas)

Abrir el `main.py` del Hermes y agregar exactamente estas 2 líneas:

**Línea 1** — Al inicio del archivo, junto a los otros imports:
```python
from gestion import registrar_handlers
```

**Línea 2** — Después de donde se construye el `application` (después del `.build()`):
```python
registrar_handlers(application)
```

**Ejemplo de cómo quedaría:**
```python
# ... imports existentes del Hermes ...
from gestion import registrar_handlers          # ← NUEVA LÍNEA

# ... código existente del Hermes ...

application = (
    Application.builder()
    .token(BOT_TOKEN)
    .build()
)

registrar_handlers(application)                 # ← NUEVA LÍNEA

# ... resto del código del Hermes (add_handler, run_polling, etc.) ...
```

---

### PASO 6 — Instalar dependencias faltantes

En el VPS, dentro del entorno virtual del Hermes:

```bash
# Activar entorno virtual (si usa uno)
source venv/bin/activate   # Linux/Mac
# o
.venv\Scripts\activate     # Windows

# Instalar solo lo que falta
pip install firebase-admin>=6.0.0

# Si openai no está instalado:
pip install openai>=1.0.0

# Verificar instalación
pip show firebase-admin openai
```

---

### PASO 7 — Reiniciar el Hermes

```bash
# Si usa systemd:
sudo systemctl restart hermes
sudo systemctl status hermes    # Verificar que esté corriendo

# Si usa PM2:
pm2 restart hermes
pm2 logs hermes                 # Ver logs en tiempo real

# Si usa screen/tmux:
# Entrar a la sesión, detener con Ctrl+C y volver a iniciar
python main.py
```

---

## 6. VERIFICAR QUE FUNCIONA

1. Abrir Telegram y buscar el bot Hermes
2. Enviar el comando: `/gestion_ayuda`
   - Debe responder con la lista de comandos
3. Enviar un **audio de voz** diciendo algo como:
   > *"Necesito una solicitud para el Club Deportivo Medellín, evento de atletismo el 15 de agosto, necesitan cronometraje para 150 participantes y medallería con 30 medallas"*
4. El bot debe:
   - Responder "🎙️ Procesando tu audio..."
   - Mostrar la transcripción
   - Mostrar el resumen extraído con botones ✅ Confirmar / ❌ Cancelar
5. Confirmar → verificar en Firebase Console que aparece el documento en la colección `solicitudes`

---

## 7. GESTIÓN DE USUARIOS AUTORIZADOS

El bot solo responde a usuarios en la colección `bot_users` de Firestore.

**Para agregar un usuario autorizado manualmente en Firestore:**
```
Colección: bot_users
Documento ID: [telegram_id_del_usuario]  (ej: "123456789")
Campos:
  - nombre: "Juan García"
  - telegramId: "123456789"
  - activo: true
  - creadoEn: [fecha actual ISO]
```

**O desde el sistema web:**
Ir a `admin.html` → pestaña **🤖 Telegram Bot** → **+ Autorizar Usuario**

> Para que un usuario sepa su ID de Telegram: abrir Telegram → buscar `@userinfobot` → escribir cualquier mensaje → responde con el ID numérico.

---

## 8. ESTRUCTURA DE DATOS EN FIRESTORE

El módulo usa estas colecciones. Créalas vacías si no existen (Firestore las crea automáticamente al primer write):

| Colección | Qué guarda |
|-----------|------------|
| `solicitudes` | Todos los proyectos y eventos del sistema |
| `bot_users` | Usuarios autorizados para usar el bot |
| `notificaciones` | Alertas del sistema |
| `config/areas` | Configuración de áreas (opcional) |

---

## 9. POSIBLES ERRORES Y SOLUCIONES

| Error | Causa | Solución |
|-------|-------|---------|
| `ModuleNotFoundError: gestion` | La carpeta no está en el path correcto | Verificar que `gestion/` esté junto al `main.py` |
| `GROQ_API_KEY not set` | Variable de entorno faltante | Agregar al `.env` y reiniciar |
| `firebase_admin` error de credenciales | Ruta del JSON incorrecta | Verificar `FIREBASE_CRED_PATH` con ruta absoluta |
| Bot no responde a audio | Usuario no autorizado en `bot_users` | Agregar el Telegram ID en Firestore |
| `deepseek` timeout | API DeepSeek con problemas | Reintentar — es temporal |

---

## 10. CONTACTO Y ARCHIVOS

Los archivos del módulo están en:
```
C:\Users\DIBER VEGA\Desktop\GESTION\bot\gestion\
```

La guía técnica detallada está en:
```
C:\Users\DIBER VEGA\.gemini\antigravity\brain\d1447e3e-...\walkthrough.md
```
