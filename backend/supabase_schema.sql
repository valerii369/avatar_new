-- ============================================================
-- AVATAR v2.1 — Complete Database Schema
-- Run entirely in Supabase SQL Editor
-- ============================================================

-- ─── Extensions ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. Users ────────────────────────────────────────────────
-- Primary user record, keyed by Telegram ID
CREATE TABLE users (
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

CREATE INDEX idx_users_tg_id ON users(tg_id);

-- ─── 2. User Birth Data ──────────────────────────────────────
-- Stores raw birth data submitted during onboarding
CREATE TABLE user_birth_data (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      TEXT NOT NULL,
    birth_date   TEXT NOT NULL,   -- YYYY-MM-DD
    birth_time   TEXT NOT NULL,   -- HH:MM
    birth_place  TEXT NOT NULL,
    gender       TEXT NOT NULL DEFAULT 'male',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_birth_data_user_id ON user_birth_data(user_id);

-- ─── 3. Geocoding Cache ──────────────────────────────────────
CREATE TABLE geocode_cache (
    city_name   TEXT PRIMARY KEY,
    lat         FLOAT NOT NULL,
    lon         FLOAT NOT NULL,
    timezone    TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4. Book Chunks (RAG) ────────────────────────────────────
CREATE TABLE book_chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content     TEXT NOT NULL,
    source      TEXT NOT NULL,
    category    TEXT NOT NULL,   -- 'western_astrology' | 'human_design' | 'bazi' | 'tzolkin'
    embedding   vector(1536) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON book_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_book_chunks_category ON book_chunks(category);

-- RPC: semantic search in book_chunks
CREATE OR REPLACE FUNCTION match_book_chunks(
    query_embedding  vector(1536),
    match_threshold  float,
    match_count      int,
    p_category       text
)
RETURNS TABLE (
    id          UUID,
    content     TEXT,
    source      TEXT,
    similarity  FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        bc.id,
        bc.content,
        bc.source,
        1 - (bc.embedding <=> query_embedding) AS similarity
    FROM book_chunks bc
    WHERE bc.category = p_category
      AND 1 - (bc.embedding <=> query_embedding) > match_threshold
    ORDER BY bc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ─── 5. User Insights (DSB Output) ──────────────────────────
CREATE TABLE user_insights (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT NOT NULL,
    system              TEXT NOT NULL,          -- 'western_astrology' | ...
    primary_sphere      INT  NOT NULL CHECK (primary_sphere BETWEEN 1 AND 12),
    rank                INT  NOT NULL,
    influence_level     TEXT NOT NULL CHECK (influence_level IN ('high', 'medium', 'low')),
    weight              FLOAT NOT NULL CHECK (weight BETWEEN 0.0 AND 1.0),
    position            TEXT NOT NULL,
    core_theme          TEXT NOT NULL,
    energy_description  TEXT NOT NULL,
    light_aspect        TEXT NOT NULL,
    shadow_aspect       TEXT NOT NULL,
    developmental_task  TEXT NOT NULL,
    integration_key     TEXT NOT NULL,
    triggers            TEXT[] NOT NULL,
    source              TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_insights_user_system ON user_insights(user_id, system, primary_sphere);

-- ─── 6. User Portraits ───────────────────────────────────────
CREATE TABLE user_portraits (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           TEXT NOT NULL,
    core_identity     TEXT NOT NULL DEFAULT '',
    core_archetype    TEXT NOT NULL DEFAULT '',
    narrative_role    TEXT NOT NULL DEFAULT '',
    energy_type       TEXT NOT NULL DEFAULT '',
    current_dynamic   TEXT NOT NULL DEFAULT '',
    deep_profile_data JSONB,      -- { polarities: { core_strengths, shadow_aspects } }
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_portraits_user_id ON user_portraits(user_id);

-- ─── 7. Assistant Memory ─────────────────────────────────────
CREATE TABLE user_memory (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL,
    message     TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    embedding   vector(1536),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON user_memory
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_user_memory_user_id ON user_memory(user_id);

-- RPC: semantic search in user_memory (per user)
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

-- ─── 8. UIS Error Log ────────────────────────────────────────
CREATE TABLE uis_errors (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       TEXT NOT NULL,
    raw_response  TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL,
    attempt       INT  NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_uis_errors_user_id ON uis_errors(user_id);

-- ─── Triggers: auto-update updated_at on users ───────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
