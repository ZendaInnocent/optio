ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "workflow_type" text NOT NULL DEFAULT 'do-work';
