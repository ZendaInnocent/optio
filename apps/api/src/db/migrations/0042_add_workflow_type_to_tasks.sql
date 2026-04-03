-- +goose Up
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "workflow_type" text NOT NULL DEFAULT 'do-work';

-- +goose Down
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "workflow_type";
