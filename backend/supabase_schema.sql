-- AVATAR v2.0 - Database Schema Migration
-- Execute this entirely in the Supabase SQL Editor

-- 1. Geocoding Cache (Layer 1)
CREATE TABLE geocode_cache (
    city_name   TEXT PRIMARY KEY,
    lat         FLOAT NOT NULL,
    lon         FLOAT NOT NULL,
    timezone    TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Book Chunks for Vector Search (Layer 2)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE book_chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content     TEXT NOT NULL,
    source      TEXT NOT NULL,
    category    TEXT NOT NULL,
    embedding   vector(1536) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Note: We create a PostgreSQL function (RPC) for similarity search
CREATE OR REPLACE FUNCTION match_book_chunks(
    query_embedding vector(1536),
    match_threshold float,
    match_count int,
    p_category text
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    source TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        book_chunks.id,
        book_chunks.content,
        book_chunks.source,
        1 - (book_chunks.embedding <=> query_embedding) AS similarity
    FROM book_chunks
    WHERE book_chunks.category = p_category
      AND 1 - (book_chunks.embedding <=> query_embedding) > match_threshold
    ORDER BY book_chunks.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 3. User Insights Table (Layer 3 - Output)
-- This table stores everything shown on the "Твой мир" frontend screen
CREATE TABLE user_insights (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT NOT NULL, -- Telegram User ID or Auth UUID
    system              TEXT NOT NULL, -- e.g., 'western_astrology'
    primary_sphere      INT NOT NULL,  -- 1 to 12
    rank                INT NOT NULL,  -- Sort order within sphere
    influence_level     TEXT NOT NULL,
    weight              FLOAT NOT NULL,
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

-- 4. Unified Assistant Memory
CREATE TABLE user_memory (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL,
    message     TEXT NOT NULL,
    role        TEXT NOT NULL,
    embedding   vector(1536),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. QA/Logging for LLM failures
CREATE TABLE uis_errors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL,
    raw_response    TEXT NOT NULL,
    error_message   TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
