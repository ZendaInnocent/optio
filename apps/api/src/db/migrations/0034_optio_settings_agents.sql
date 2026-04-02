ALTER TABLE "optio_settings" ADD COLUMN IF NOT EXISTS "agents" jsonb DEFAULT '[{"type":"claude-code","enabled":true},{"type":"codex","enabled":false},{"type":"opencode","enabled":false}]'::jsonb NOT NULL;
ALTER TABLE "optio_settings" ADD COLUMN IF NOT EXISTS "default_agent" text DEFAULT 'claude-code' NOT NULL;
