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


async def reset_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /reset — clear all user data and restart onboarding."""
    tg_id = update.effective_user.id
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "http://127.0.0.1:8000/api/auth/reset",
                json={"tg_id": tg_id},
            )
            if resp.status_code == 200:
                await update.message.reply_text(
                    "✅ Данные сброшены. Нажми /start чтобы пройти онбординг заново."
                )
            else:
                await update.message.reply_text(
                    f"⚠️ Ошибка сброса: {resp.text}"
                )
    except Exception as e:
        logger.error(f"Reset command failed for tg_id={tg_id}: {e}")
        await update.message.reply_text("⚠️ Не удалось сбросить данные. Бэкенд недоступен.")


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Команды:\n/start — открыть AVATAR MATRIX\n/reset — сбросить данные и пройти онбординг заново"
    )


def main() -> None:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        logger.error("TELEGRAM_BOT_TOKEN not set in .env")
        sys.exit(1)

    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("reset", reset_command))
    app.add_handler(CommandHandler("help", help_command))

    logger.info("AVATAR Matrix bot started (polling)...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
