# ============================================================
# IA.PY — Transcripción con Groq Whisper + Extracción con DeepSeek
# ============================================================
# ✅ DeepSeek es 100% compatible con el SDK de OpenAI
# ✅ Groq Whisper es 100% compatible con el SDK de OpenAI
# Solo cambia la base_url y el model — el resto del código es idéntico
# ============================================================
import tempfile, os, json, logging
from openai import AsyncOpenAI
from .config import (
    DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL,
    GROQ_API_KEY, GROQ_BASE_URL, GROQ_MODEL_STT,
)

logger = logging.getLogger(__name__)

# ── Cliente DeepSeek (para extracción de datos) ───────────────
# Mismo SDK de OpenAI, solo cambia la URL base
deepseek_client = AsyncOpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_BASE_URL,
)

# ── Cliente Groq (para transcripción de audio con Whisper) ────
# También usa el mismo SDK de OpenAI — Groq es compatible
groq_client = AsyncOpenAI(
    api_key=GROQ_API_KEY,
    base_url=GROQ_BASE_URL,
)


async def transcribir_audio(audio_bytes: bytes, extension: str = 'ogg') -> str:
    """
    Transcribe audio de voz usando Groq Whisper (GRATIS, ~2000 min/día).
    Groq es la opción más rápida disponible — transcribe en menos de 1 segundo.
    """
    with tempfile.NamedTemporaryFile(suffix=f'.{extension}', delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        with open(tmp_path, 'rb') as f:
            resultado = await groq_client.audio.transcriptions.create(
                model=GROQ_MODEL_STT,          # whisper-large-v3-turbo
                file=f,
                language='es',
                response_format='text',
            )
        # Groq devuelve el texto directamente si response_format='text'
        return resultado if isinstance(resultado, str) else resultado.text
    except Exception as e:
        logger.error(f'Error Groq Whisper: {e}')
        raise RuntimeError(f'No se pudo transcribir el audio: {e}')
    finally:
        os.unlink(tmp_path)


async def extraer_solicitud(texto: str, areas: list) -> dict:
    """
    Usa DeepSeek (deepseek-chat) para extraer datos estructurados del texto.
    DeepSeek es 100% compatible con la API de OpenAI — solo cambia el modelo.
    """
    areas_str = ', '.join(f'{a["id"]} = "{a["nombre"]}"' for a in areas)

    prompt = f"""Eres un asistente experto en gestión de eventos deportivos en Colombia.
Tu tarea es extraer información de solicitudes de servicio a partir de texto transcrito por voz.

Áreas de servicio disponibles: {areas_str}

Analiza el texto y devuelve ÚNICAMENTE un JSON válido con este formato exacto:
{{
  "titulo": "Nombre descriptivo del evento (ej: Torneo de Atletismo Medellín 2026)",
  "cliente": "Nombre del cliente o empresa contratante",
  "fechaEvento": "YYYY-MM-DD o null si no se menciona",
  "areas": ["id_area1", "id_area2"],
  "descripcion": "Descripción general del evento en 1-2 oraciones",
  "prioridad": "alta|media|baja",
  "contacto": "teléfono o email si se menciona, o ''",
  "notas": "Información adicional relevante",
  "servicios": [
    {{
      "nombre": "Nombre del servicio específico",
      "area": "id_area correspondiente",
      "cantidad": 0,
      "unidad": "participantes|medallas|horas|metros|unidades",
      "descripcion": "Detalle del servicio"
    }}
  ],
  "financiero": {{
    "valorCotizado": 0,
    "anticipo": 0,
    "estadoPago": "sin_pago|parcial|pagado"
  }},
  "confianza": 0.85,
  "camposFaltantes": ["campos importantes que no se mencionaron"]
}}

Texto a analizar:
"{texto}"

Reglas importantes:
- Si no se menciona fecha → usa null
- Si no se menciona valor → usa 0
- Infiere el área por contexto:
  * cronometraje → tiempo, participantes, chip, clasificación, resultados
  * medalleria → medallas, trofeos, reconocimientos, premiación
  * fotografia → fotos, video, cobertura, registro fotográfico
  * diseno → logos, material gráfico, pendones, diseño
  * administrativa → contratos, logística, coordinación general
  * permisos → permisos, licencias, alcaldía, espacios públicos
- confianza: número entre 0.0 y 1.0 según certeza de la extracción
- camposFaltantes: menciona los campos más importantes que no se especificaron
- Responde SOLO con el JSON, sin texto adicional"""

    try:
        response = await deepseek_client.chat.completions.create(
            model=DEEPSEEK_MODEL,       # deepseek-chat
            messages=[
                {
                    'role': 'system',
                    'content': 'Eres un asistente de gestión deportiva. Devuelves SOLO JSON válido, sin markdown, sin explicaciones.',
                },
                {
                    'role': 'user',
                    'content': prompt,
                }
            ],
            temperature=0.1,            # Muy determinístico para extracción de datos
            max_tokens=1500,
        )

        content = response.choices[0].message.content.strip()

        # Limpiar posible markdown que DeepSeek a veces agrega
        if content.startswith('```'):
            content = content.split('```')[1]
            if content.startswith('json'):
                content = content[4:]
            content = content.strip()
        if content.endswith('```'):
            content = content[:-3].strip()

        return json.loads(content)

    except json.JSONDecodeError as e:
        logger.error(f'DeepSeek retornó JSON inválido: {e}')
        # Retornar datos mínimos si falla el parsing
        return {
            'titulo': 'Solicitud desde Telegram',
            'cliente': '',
            'fechaEvento': None,
            'areas': [],
            'descripcion': texto[:200],
            'prioridad': 'media',
            'contacto': '',
            'notas': f'Transcripción: {texto}',
            'servicios': [],
            'financiero': {'valorCotizado': 0, 'anticipo': 0, 'estadoPago': 'sin_pago'},
            'confianza': 0.3,
            'camposFaltantes': ['todos los campos (error en extracción)'],
        }
    except Exception as e:
        logger.error(f'Error DeepSeek extracción: {e}')
        raise RuntimeError(f'Error al procesar con DeepSeek: {e}')
