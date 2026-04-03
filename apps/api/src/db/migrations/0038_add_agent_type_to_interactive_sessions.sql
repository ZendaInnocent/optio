ALTER TABLE interactive_sessions ADD COLUMN agent_type text;
ALTER TABLE interactive_sessions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT NOW();
