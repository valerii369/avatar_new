-- Migration: Progressive Portrait Synthesis columns
-- Adds sphere_summaries, master_portrait, active_spheres_count to user_portraits

ALTER TABLE user_portraits
    ADD COLUMN IF NOT EXISTS sphere_summaries    JSONB    NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS master_portrait     JSONB,
    ADD COLUMN IF NOT EXISTS active_spheres_count INT     NOT NULL DEFAULT 0;
