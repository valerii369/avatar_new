-- AVATAR v2.1 — Migration 002: Retriever traces for RAG observability

CREATE TABLE IF NOT EXISTS retriever_traces (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id         UUID NOT NULL,
    user_id          TEXT,
    trace_label      TEXT NOT NULL DEFAULT 'unknown',
    query_index      INT NOT NULL,
    query_text       TEXT NOT NULL,
    min_score        FLOAT NOT NULL,
    top_k_per_query  INT NOT NULL,
    returned_count   INT NOT NULL DEFAULT 0,
    chunk_ids        JSONB NOT NULL DEFAULT '[]'::jsonb,
    documents        JSONB NOT NULL DEFAULT '[]'::jsonb,
    error            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retriever_traces_trace_id
    ON retriever_traces(trace_id);

CREATE INDEX IF NOT EXISTS idx_retriever_traces_user_id_created_at
    ON retriever_traces(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_retriever_traces_label_created_at
    ON retriever_traces(trace_label, created_at DESC);
