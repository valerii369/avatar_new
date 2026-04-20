-- AVATAR v2.1 — Migration 003: Assistant sessions, messages, and usage metadata

CREATE TABLE IF NOT EXISTS assistant_sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           TEXT NOT NULL,
    client_session_id BIGINT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'active',
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at          TIMESTAMPTZ,
    UNIQUE (user_id, client_session_id)
);

CREATE INDEX IF NOT EXISTS idx_assistant_sessions_user_id_last_activity
    ON assistant_sessions(user_id, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_sessions_status
    ON assistant_sessions(status);


CREATE TABLE IF NOT EXISTS assistant_messages (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           TEXT NOT NULL,
    session_id        UUID NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
    client_session_id BIGINT NOT NULL,
    turn_index        INT NOT NULL DEFAULT 0,
    role              TEXT NOT NULL,
    content           TEXT NOT NULL DEFAULT '',
    model             TEXT,
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_session_created
    ON assistant_messages(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_user_created
    ON assistant_messages(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_client_session
    ON assistant_messages(user_id, client_session_id, turn_index);


CREATE TABLE IF NOT EXISTS assistant_generations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               TEXT NOT NULL,
    session_id            UUID NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
    client_session_id     BIGINT NOT NULL,
    turn_index            INT NOT NULL DEFAULT 0,
    provider              TEXT NOT NULL DEFAULT 'openai',
    endpoint              TEXT NOT NULL DEFAULT 'chat.completions',
    model                 TEXT NOT NULL,
    request_message_id    UUID REFERENCES assistant_messages(id) ON DELETE SET NULL,
    response_message_id   UUID REFERENCES assistant_messages(id) ON DELETE SET NULL,
    system_prompt         TEXT NOT NULL DEFAULT '',
    rag_context           TEXT NOT NULL DEFAULT '',
    tool_names            JSONB NOT NULL DEFAULT '[]'::jsonb,
    finish_reason         TEXT,
    temperature           FLOAT,
    max_completion_tokens INT,
    prompt_tokens         INT NOT NULL DEFAULT 0,
    completion_tokens     INT NOT NULL DEFAULT 0,
    total_tokens          INT NOT NULL DEFAULT 0,
    cached_input_tokens   INT NOT NULL DEFAULT 0,
    reasoning_tokens      INT NOT NULL DEFAULT 0,
    latency_ms            INT,
    request_metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_generations_session_created
    ON assistant_generations(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_assistant_generations_user_created
    ON assistant_generations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_generations_client_session
    ON assistant_generations(user_id, client_session_id, turn_index);