-- Add opencode model columns to repos table
ALTER TABLE repos ADD COLUMN IF NOT EXISTS opencode_model text;
ALTER TABLE repos ADD COLUMN IF NOT EXISTS opencode_temperature numeric;
ALTER TABLE repos ADD COLUMN IF NOT EXISTS opencode_top_p numeric;

-- Add secret_proxy column if not exists
ALTER TABLE repos ADD COLUMN IF NOT EXISTS secret_proxy boolean NOT NULL DEFAULT false;

-- Add docker_in_docker column if not exists
ALTER TABLE repos ADD COLUMN IF NOT EXISTS docker_in_docker boolean NOT NULL DEFAULT false;
