"""
AVATAR Matrix Telegram Bot — Mini App launcher.
Runs as a separate process alongside the FastAPI backend.

Start: python bot.py
"""

import logging
import os
import sys

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

# Allow running from backend/ directory
sys.path.insert(0, os.path.dirname(__file__))
from app.core.config import settings

logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

WELCOME_TEXT = (
    "✦ *AVATAR MATRIX*\n\n"
    "Твой персональный астро-психологический разбор по 12 сферам жизни.\n\n"
    "Нажми кнопку ниже, чтобы открыть приложение 👇"
)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start — send welcome message with Mini App button."""
    mini_app_url = settings.MINI_APP_URL
    if not mini_app_url:
        await update.message.reply_text(
            "⚠️ Mini App URL не настроен. Обратитесь к администратору."
        )
        return

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            text="🌌 Открыть AVATAR MATRIX",
            web_app=WebAppInfo(url=mini_app_url),
        )]
    ])

    await update.message.reply_text(
        WELCOME_TEXT,
        parse_mode="Markdown",
        reply_markup=keyboard,
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Используй /start чтобы открыть AVATAR MATRIX."
    )


def main() -> None:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        logger.error("TELEGRAM_BOT_TOKEN not set in .env")
        sys.exit(1)

    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))

    logger.info("AVATAR Matrix bot started (polling)...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
