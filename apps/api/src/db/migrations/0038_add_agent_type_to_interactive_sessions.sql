-- +goose Up
ALTER TABLE interactive_sessions ADD COLUMN agent_type text;
ALTER TABLE interactive_sessions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT NOW();

-- +goose Down
ALTER TABLE interactive_sessions DROP COLUMN agent_type;
ALTER TABLE interactive_sessions DROP COLUMN updated_at;
