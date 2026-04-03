-- +goose Up
ALTER TABLE interactive_sessions ADD COLUMN model text;

-- +goose Down
ALTER TABLE interactive_sessions DROP COLUMN model;
