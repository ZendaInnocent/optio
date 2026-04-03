-- Add enabled_models column to optio_settings
ALTER TABLE optio_settings ADD COLUMN IF NOT EXISTS enabled_models jsonb DEFAULT '[]'::jsonb NOT NULL;
