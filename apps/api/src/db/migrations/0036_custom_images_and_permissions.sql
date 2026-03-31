-- Add can_build column to workspace_members
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS can_build boolean NOT NULL DEFAULT false;

-- Add agent_types column to repos
ALTER TABLE repos ADD COLUMN IF NOT EXISTS agent_types jsonb;

-- Create custom_images table
CREATE TABLE IF NOT EXISTS custom_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repo_url text,
  image_tag text NOT NULL,
  agent_types jsonb NOT NULL DEFAULT '[]',
  language_preset text,
  custom_dockerfile text,
  build_status text NOT NULL DEFAULT 'pending',
  build_logs text,
  built_at timestamptz,
  built_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Add unique constraint on workspace_id + repo_url for custom_images
CREATE UNIQUE INDEX IF NOT EXISTS custom_images_workspace_repo_key ON custom_images(workspace_id, repo_url);

-- Add indexes for custom_images
CREATE INDEX IF NOT EXISTS custom_images_workspace_idx ON custom_images(workspace_id);
CREATE INDEX IF NOT EXISTS custom_images_repo_url_idx ON custom_images(repo_url);

-- Add default_agent_type and default_language_preset to optio_settings
ALTER TABLE optio_settings ADD COLUMN IF NOT EXISTS default_agent_type text;
ALTER TABLE optio_settings ADD COLUMN IF NOT EXISTS default_language_preset text;