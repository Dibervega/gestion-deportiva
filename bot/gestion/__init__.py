# ============================================================
# __INIT__.PY — Punto de entrada del módulo
# El desarrollador de Hermes SOLO necesita agregar 2 líneas:
#
#   from gestion import registrar_handlers
#   registrar_handlers(application)
#
# Donde 'application' es el objeto Application de python-telegram-bot
# ============================================================
from telegram.ext import MessageHandler, CommandHandler, CallbackQueryHandler, filters
from .comandos import (
    handle_audio,
    callback_confirm,
    callback_cancel,
    cmd_estado,
    cmd_proyectos,
    cmd_vigentes,
    cmd_ayuda_gestion,
)


def registrar_handlers(application):
    """
    Registra todos los handlers de Gestión Deportiva en el bot Hermes.

    Llama esta función UNA vez en main.py, pasando el objeto application:

        from gestion import registrar_handlers
        registrar_handlers(application)
    """
    # Audio de voz → crear solicitud con IA
    application.add_handler(MessageHandler(filters.VOICE, handle_audio))

    # Callbacks de confirmación
    application.add_handler(CallbackQueryHandler(callback_confirm, pattern='^gestion_confirm$'))
    application.add_handler(CallbackQueryHandler(callback_cancel,  pattern='^gestion_cancel$'))

    # Comandos con prefijo /gestion_ para no chocar con comandos del Hermes
    application.add_handler(CommandHandler('gestion_estado',    cmd_estado))
    application.add_handler(CommandHandler('gestion_proyectos', cmd_proyectos))
    application.add_handler(CommandHandler('gestion_vigentes',  cmd_vigentes))
    application.add_handler(CommandHandler('gestion_ayuda',     cmd_ayuda_gestion))

    print('✅ Módulo Gestión Deportiva registrado en Hermes')
