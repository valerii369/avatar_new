-- AVATAR v2.1 — Migration 004: Assistant retrieval traces

CREATE TABLE IF NOT EXISTS assistant_retrievals (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           TEXT NOT NULL,
    session_id        UUID NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
    generation_id     UUID REFERENCES assistant_generations(id) ON DELETE SET NULL,
    client_session_id BIGINT NOT NULL,
    turn_index        INT NOT NULL DEFAULT 0,
    query_text        TEXT NOT NULL DEFAULT '',
    requested_k       INT NOT NULL DEFAULT 0,
    threshold         FLOAT NOT NULL DEFAULT 0,
    returned_count    INT NOT NULL DEFAULT 0,
    matches           JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_retrievals_session_created
    ON assistant_retrievals(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_assistant_retrievals_generation
    ON assistant_retrievals(generation_id);

CREATE INDEX IF NOT EXISTS idx_assistant_retrievals_user_created
    ON assistant_retrievals(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_retrievals_client_session
    ON assistant_retrievals(user_id, client_session_id, turn_index);
