-- +goose Up
CREATE TABLE IF NOT EXISTS "session_messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "session_id" uuid NOT NULL REFERENCES "interactive_sessions"("id") ON DELETE CASCADE,
    "role" text NOT NULL,
    "content" text NOT NULL,
    "timestamp" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "session_messages_session_id_idx" ON "session_messages"("session_id");
CREATE INDEX IF NOT EXISTS "session_messages_timestamp_idx" ON "session_messages"("timestamp");

-- +goose Down
DROP TABLE IF EXISTS "session_messages";
