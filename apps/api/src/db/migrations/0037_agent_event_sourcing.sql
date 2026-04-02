-- Migration: Agent Event Sourcing System
-- Author: Agent Workflow
-- Description: Event-sourced agent thread storage for workflow state management

-- Agent Threads: Main execution context
CREATE TABLE agent_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES agent_threads(id),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    agent_type TEXT NOT NULL DEFAULT 'do-work',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'forked')),
    current_phase TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_agent_threads_workspace ON agent_threads(workspace_id);
CREATE INDEX idx_agent_threads_status ON agent_threads(status);
CREATE INDEX idx_agent_threads_parent ON agent_threads(parent_id);

-- Thread Events: Append-only event log
CREATE TABLE thread_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_version TEXT NOT NULL DEFAULT 'v1',
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_thread_events_thread ON thread_events(thread_id, created_at);
CREATE INDEX idx_thread_events_type ON thread_events(event_type);

-- Thread Snapshots: Point-in-time state for recovery
CREATE TABLE thread_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
    event_index INTEGER NOT NULL,
    phase TEXT NOT NULL,
    state JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_thread_snapshots_thread ON thread_snapshots(thread_id, event_index DESC);

-- Event Corrections: Allow fixing event history
CREATE TABLE event_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_event_id UUID NOT NULL REFERENCES thread_events(id) ON DELETE CASCADE,
    corrected_payload JSONB NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_event_corrections_original ON event_corrections(original_event_id);

-- Function to get thread history as JSON
CREATE OR REPLACE FUNCTION get_thread_history(thread_uuid UUID)
RETURNS JSONB AS $$
BEGIN
    RETURN (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', e.id,
                'event_type', e.event_type,
                'payload', e.payload,
                'created_at', e.created_at
            ) ORDER BY e.created_at
        )
        FROM thread_events e
        WHERE e.thread_id = thread_uuid
    );
END;
$$ LANGUAGE plpgsql;

-- Function to replay thread to specific point
CREATE OR REPLACE FUNCTION replay_thread(thread_uuid UUID, up_to_index INTEGER)
RETURNS JSONB AS $$
BEGIN
    RETURN (
        SELECT jsonb_agg(e.payload ORDER BY e.created_at)
        FROM (
            SELECT e.payload, e.created_at
            FROM thread_events e
            WHERE e.thread_id = thread_uuid
            ORDER BY e.created_at
            LIMIT up_to_index
        ) e
    );
END;
$$ LANGUAGE plpgsql;

-- Function to create thread fork
CREATE OR REPLACE FUNCTION fork_thread(parent_uuid UUID, fork_metadata JSONB DEFAULT '{}')
RETURNS UUID AS $$
DECLARE
    new_thread_id UUID;
    new_status TEXT;
BEGIN
    -- Get parent status
    SELECT status INTO new_status FROM agent_threads WHERE id = parent_uuid;
    
    -- Insert new thread
    INSERT INTO agent_threads (id, parent_id, workspace_id, agent_type, status, current_phase, metadata)
    SELECT gen_random_uuid(), parent_uuid, workspace_id, agent_type, 'forked', current_phase, fork_metadata
    FROM agent_threads WHERE id = parent_uuid
    RETURNING id INTO new_thread_id;
    
    -- Copy all events to new thread
    INSERT INTO thread_events (thread_id, event_type, event_version, payload)
    SELECT new_thread_id, event_type, event_version, payload
    FROM thread_events WHERE thread_id = parent_uuid
    ORDER BY created_at;
    
    -- Copy latest snapshot
    INSERT INTO thread_snapshots (thread_id, event_index, phase, state)
    SELECT new_thread_id, event_index, phase, state
    FROM thread_snapshots
    WHERE thread_id = parent_uuid
    ORDER BY event_index DESC
    LIMIT 1;
    
    RETURN new_thread_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_thread_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_agent_threads_update
    BEFORE UPDATE ON agent_threads
    FOR EACH ROW
    EXECUTE FUNCTION update_thread_timestamp();
