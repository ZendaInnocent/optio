-- Unified Agent Runs: Create agent_run_mode, agent_run_state enums and tables
-- Migration: 0048_unified_agent_runs

-- Create enums
DO $$ BEGIN
    CREATE TYPE "public"."agent_run_mode" AS ENUM('autonomous', 'supervised', 'interactive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "public"."agent_run_state" AS ENUM(
        'pending',
        'queued',
        'provisioning',
        'running',
        'needs_attention',
        'completed',
        'failed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create agent_runs table
CREATE TABLE IF NOT EXISTS "agent_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "repo_id" uuid NOT NULL REFERENCES "repos"("id") ON DELETE CASCADE,
    "title" text NOT NULL,
    "initial_prompt" text NOT NULL,
    "mode" "agent_run_mode" NOT NULL DEFAULT 'autonomous',
    "state" "agent_run_state" NOT NULL DEFAULT 'pending',
    "agent_type" text NOT NULL,
    "model" text,
    "branch_name" text,
    "worktree_path" text,
    "session_id" text,
    "pr_url" text,
    "cost_usd" numeric(10,6) DEFAULT '0',
    "max_turns" integer,
    "metadata" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "ended_at" timestamp with time zone
);

-- Indexes for agent_runs
CREATE INDEX IF NOT EXISTS "agent_runs_workspace_created_idx" ON "agent_runs" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_runs_repo_state_idx" ON "agent_runs" ("repo_id", "state");
CREATE INDEX IF NOT EXISTS "agent_runs_state_updated_idx" ON "agent_runs" ("state", "updated_at");

-- Create agent_run_events table
CREATE TABLE IF NOT EXISTS "agent_run_events" (
    "id" bigserial PRIMARY KEY,
    "agent_run_id" uuid NOT NULL REFERENCES "agent_runs"("id") ON DELETE CASCADE,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    "type" text NOT NULL,
    "content" jsonb,
    "turn" integer
);

-- Indexes for agent_run_events
CREATE INDEX IF NOT EXISTS "agent_run_events_agent_run_id_idx" ON "agent_run_events" ("agent_run_id");
CREATE INDEX IF NOT EXISTS "agent_run_events_timestamp_idx" ON "agent_run_events" ("timestamp");
CREATE INDEX IF NOT EXISTS "agent_run_events_agent_run_type_idx" ON "agent_run_events" ("agent_run_id", "type");

-- Create agent_run_prs table
CREATE TABLE IF NOT EXISTS "agent_run_prs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "agent_run_id" uuid NOT NULL REFERENCES "agent_runs"("id") ON DELETE CASCADE,
    "pr_url" text NOT NULL,
    "pr_number" integer,
    "title" text,
    "state" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes for agent_run_prs
CREATE INDEX IF NOT EXISTS "agent_run_prs_agent_run_id_idx" ON "agent_run_prs" ("agent_run_id");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_run_prs_agent_run_pr_url_key" ON "agent_run_prs" ("agent_run_id", "pr_url");
