-- ============================================================
-- AVATAR v2.1 — Missing Tables Migration
-- Apply in: https://supabase.com/dashboard/project/gltglzxcjitbdwhqgyre/sql
-- Run this ENTIRE file at once
-- ============================================================

-- ─── 1. users ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tg_id            TEXT UNIQUE NOT NULL,
    first_name       TEXT NOT NULL DEFAULT '',
    last_name        TEXT NOT NULL DEFAULT '',
    username         TEXT NOT NULL DEFAULT '',
    photo_url        TEXT NOT NULL DEFAULT '',
    xp               INT  NOT NULL DEFAULT 0,
    xp_current       INT  NOT NULL DEFAULT 0,
    xp_next          INT  NOT NULL DEFAULT 1000,
    evolution_level  INT  NOT NULL DEFAULT 1,
    title            TEXT NOT NULL DEFAULT 'Новичок',
    energy           INT  NOT NULL DEFAULT 100,
    streak           INT  NOT NULL DEFAULT 0,
    referral_code    TEXT NOT NULL DEFAULT '',
    onboarding_done  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_tg_id ON users(tg_id);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 2. user_birth_data ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_birth_data (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      TEXT NOT NULL,
    birth_date   TEXT NOT NULL,
    birth_time   TEXT NOT NULL,
    birth_place  TEXT NOT NULL,
    gender       TEXT NOT NULL DEFAULT 'male',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_birth_data_user_id ON user_birth_data(user_id);

-- ─── 3. user_portraits ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_portraits (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           TEXT NOT NULL,
    core_identity     TEXT NOT NULL DEFAULT '',
    core_archetype    TEXT NOT NULL DEFAULT '',
    narrative_role    TEXT NOT NULL DEFAULT '',
    energy_type       TEXT NOT NULL DEFAULT '',
    current_dynamic   TEXT NOT NULL DEFAULT '',
    deep_profile_data JSONB,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_portraits_user_id ON user_portraits(user_id);

-- ─── 4. user_memory table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS user_memory (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'assistant' | 'diary' | 'dsb:*'
    message    TEXT NOT NULL DEFAULT '',
    embedding  vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_memory_user_id ON user_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memory_role    ON user_memory(role);

-- ─── 5. match_user_memory RPC ───────────────────────────────
CREATE OR REPLACE FUNCTION match_user_memory(
    query_embedding  vector(1536),
    match_threshold  float,
    match_count      int,
    p_user_id        text
)
RETURNS TABLE (
    id          UUID,
    message     TEXT,
    role        TEXT,
    similarity  FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        um.id,
        um.message,
        um.role,
        1 - (um.embedding <=> query_embedding) AS similarity
    FROM user_memory um
    WHERE um.user_id = p_user_id
      AND um.embedding IS NOT NULL
      AND 1 - (um.embedding <=> query_embedding) > match_threshold
    ORDER BY um.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ─── Done ───────────────────────────────────────────────────
-- After applying, run the backend test:
-- curl http://localhost:8000/api/auth/login -d '{"is_dev":true,"test_user_id":12345}' -H 'Content-Type: application/json'
