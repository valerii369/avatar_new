"""
Idempotent database migrations.
Run on every deploy — all statements use IF NOT EXISTS.
Uses DATABASE_URL from .env (the same one the backend uses).
"""
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env")
    sys.exit(1)

MIGRATIONS = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMPTZ",
    """CREATE TABLE IF NOT EXISTS payments (
        id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id            TEXT        NOT NULL,
        offer_id           TEXT        NOT NULL,
        stars              INT         NOT NULL,
        telegram_charge_id TEXT        NOT NULL DEFAULT '',
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_date DATE",
]

try:
    import psycopg2
    conn = psycopg2.connect(DATABASE_URL, connect_timeout=15)
    conn.autocommit = False
    cur = conn.cursor()
    for sql in MIGRATIONS:
        cur.execute(sql)
    conn.commit()
    conn.close()
    print("✅ Migrations applied successfully")
except Exception as e:
    print(f"❌ Migration error: {e}")
    sys.exit(1)
