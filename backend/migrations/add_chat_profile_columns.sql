-- Migration: add chat-context profile columns to users table
-- Run once in Supabase SQL editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS current_location      text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_sphere           text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_satisfaction     text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status   text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS life_focus            text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_onboarding_completed boolean NOT NULL DEFAULT false;
