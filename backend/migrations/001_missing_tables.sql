-- AVATAR v2.0 — Migration 001: Missing tables & functions
-- Applies only missing objects (IF NOT EXISTS / CREATE OR REPLACE)

-- ─────────────────────────────────────────────
-- 1. users
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tg_id           BIGINT UNIQUE NOT NULL,
    first_name      TEXT,
    last_name       TEXT,
    username        TEXT,
    photo_url       TEXT,
    energy          INT DEFAULT 100,
    streak          INT DEFAULT 0,
    evolution_level INT DEFAULT 1,
    title           TEXT DEFAULT 'Новичок',
    xp              INT DEFAULT 0,
    referral_code   TEXT,
    onboarding_done BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_tg_id ON users(tg_id);

-- ─────────────────────────────────────────────
-- 2. user_birth_data
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_birth_data (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL UNIQUE,
    birth_date  DATE NOT NULL,
    birth_time  TIME,
    birth_place TEXT NOT NULL,
    lat         FLOAT,
    lon         FLOAT,
    timezone    TEXT,
    gender      TEXT DEFAULT 'male',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_birth_data_user_id ON user_birth_data(user_id);

-- ─────────────────────────────────────────────
-- 3. user_portraits
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_portraits (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           TEXT NOT NULL,
    core_identity     TEXT NOT NULL,
    core_archetype    TEXT NOT NULL,
    narrative_role    TEXT NOT NULL,
    energy_type       TEXT NOT NULL,
    current_dynamic   TEXT NOT NULL,
    deep_profile_data JSONB,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_portraits_user_id ON user_portraits(user_id);

-- ─────────────────────────────────────────────
-- 4. match_user_memory RPC (pgvector cosine similarity)
-- ─────────────────────────────────────────────
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
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        user_memory.id,
        user_memory.message,
        user_memory.role,
        1 - (user_memory.embedding <=> query_embedding) AS similarity
    FROM user_memory
    WHERE user_memory.user_id = p_user_id
      AND user_memory.embedding IS NOT NULL
      AND 1 - (user_memory.embedding <=> query_embedding) > match_threshold
    ORDER BY user_memory.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ─────────────────────────────────────────────
-- 5. Index on user_memory.embedding for HNSW fast search
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_memory_embedding
    ON user_memory USING hnsw (embedding vector_cosine_ops);

-- ─────────────────────────────────────────────
-- 6. Index on book_chunks.embedding (если не создан)
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_book_chunks_embedding
    ON book_chunks USING hnsw (embedding vector_cosine_ops);
