-- ─── Promo Codes Migration ──────────────────────────────────────────────────
-- Run this in Supabase Dashboard → SQL Editor

-- 1. Promo codes table
CREATE TABLE IF NOT EXISTS promo_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT UNIQUE NOT NULL,
    energy_reward INT NOT NULL DEFAULT 100,
    max_uses    INT NULL,           -- NULL = unlimited (still 1 per user)
    uses_count  INT NOT NULL DEFAULT 0,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Track which users used which codes (1 use per user per code)
CREATE TABLE IF NOT EXISTS promo_code_uses (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code       TEXT NOT NULL,
    used_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, code)
);

CREATE INDEX IF NOT EXISTS idx_promo_code_uses_user ON promo_code_uses(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);

-- 3. Seed: personal test code for owner — 200 energy, 1 use total
INSERT INTO promo_codes (code, energy_reward, max_uses, active)
VALUES ('MATRIX200', 200, 1, TRUE)
ON CONFLICT (code) DO NOTHING;
