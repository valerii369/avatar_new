"""
AVATAR Matrix Telegram Bot — Mini App launcher.
Runs as a separate process alongside the FastAPI backend.

Start: python bot.py
"""

import json
import logging
import os
import sys
from datetime import datetime, timedelta

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, PreCheckoutQuery, WebAppInfo, BotCommand
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, PreCheckoutQueryHandler, filters

# Allow running from backend/ directory
sys.path.insert(0, os.path.dirname(__file__))
from app.core.config import settings
from app.core.db import get_supabase

OFFER_ENERGY = {
    "pack_300": 300,
    "pack_500": 500,
    "pack_1000": 1000,
    "pack_premium": 0,
}

OFFER_NAMES = {
    "pack_300": "Заряд Света (300 энергии)",
    "pack_500": "Энергетический Импульс (500 энергии)",
    "pack_1000": "Квантовый Скачок (1000 энергии)",
    "pack_premium": "AVATAR Premium",
}

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
    """Handle /start — send welcome message with Mini App button.

    Usage:
    - /start                    — open without referral
    - /start REF_CODE          — open with referral code (e.g., /start 3KEQ8WOU)
    """
    mini_app_url = settings.MINI_APP_URL
    if not mini_app_url:
        await update.message.reply_text(
            "⚠️ Mini App URL не настроен. Обратитесь к администратору."
        )
        return

    # Get ref parameter if provided: /start ref_code
    ref_code = None
    if context.args and len(context.args) > 0:
        ref_code = context.args[0]

    # Build Mini App URL with ref parameter
    app_url = mini_app_url
    if ref_code:
        app_url = f"{mini_app_url}?ref={ref_code}"

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            text="AVATAR",
            web_app=WebAppInfo(url=app_url),
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
            # Try new endpoint first, fall back to legacy
            resp = await client.post(
                f"http://127.0.0.1:8000/api/profile/tg/{tg_id}/reset",
            )
            if resp.status_code == 404:
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


async def precheckout_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Approve every pre-checkout query so Telegram can proceed with Stars payment."""
    await update.pre_checkout_query.answer(ok=True)


async def successful_payment_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Credit energy or activate premium after a successful Stars payment."""
    payment = update.message.successful_payment
    try:
        payload = json.loads(payment.invoice_payload)
    except Exception:
        logger.error(f"Bad payment payload: {payment.invoice_payload!r}")
        return

    user_id = payload.get("user_id")
    offer_id = payload.get("offer_id")

    if not user_id or offer_id not in OFFER_ENERGY:
        logger.error(f"Unknown offer in payment payload: {payload}")
        return

    msg = "✅ Оплата получена! Начисление произойдёт в ближайшее время."

    try:
        supabase = get_supabase()
        if offer_id == "pack_premium":
            expires_at = (datetime.utcnow() + timedelta(days=30)).isoformat()
            supabase.table("users").update({
                "is_premium": True,
                "premium_expires_at": expires_at,
            }).eq("id", user_id).execute()
            msg = "💎 AVATAR Premium активирован на 30 дней!"
        else:
            energy_gain = OFFER_ENERGY[offer_id]
            res = supabase.table("users").select("energy").eq("id", user_id).execute()
            current = res.data[0]["energy"] if res.data else 0
            new_energy = min(current + energy_gain, 9999)
            supabase.table("users").update({"energy": new_energy}).eq("id", user_id).execute()
            msg = f"⚡ {OFFER_NAMES[offer_id]} зачислен! Энергия: {new_energy}"
    except Exception as e:
        logger.error(f"User update error for user {user_id}, offer {offer_id}: {e}")

    try:
        supabase = get_supabase()
        supabase.table("payments").insert({
            "user_id": user_id,
            "offer_id": offer_id,
            "stars": payment.total_amount,
            "telegram_charge_id": payment.telegram_payment_charge_id,
        }).execute()
    except Exception as e:
        logger.error(f"Payment log error for user {user_id}: {e}")

    await update.message.reply_text(msg)


def main() -> None:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        logger.error("TELEGRAM_BOT_TOKEN not set in .env")
        sys.exit(1)

    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("reset", reset_command))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(PreCheckoutQueryHandler(precheckout_handler))
    app.add_handler(MessageHandler(filters.SUCCESSFUL_PAYMENT, successful_payment_handler))

    # Register commands in Telegram menu (visible when user types "/")
    async def post_init(application: Application) -> None:
        await application.bot.set_my_commands([
            BotCommand("start", "Открыть AVATAR MATRIX"),
            BotCommand("reset", "Сбросить данные и пройти онбординг заново"),
            BotCommand("help", "Список команд"),
        ])

    app.post_init = post_init

    logger.info("AVATAR Matrix bot started (polling)...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
