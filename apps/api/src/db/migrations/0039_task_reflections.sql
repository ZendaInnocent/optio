-- +goose Up
CREATE TABLE task_reflections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES tasks(id),
    what_worked jsonb DEFAULT '[]'::jsonb,
    what_didnt_work jsonb DEFAULT '[]'::jsonb,
    improvements jsonb DEFAULT '[]'::jsonb,
    technical_debt jsonb DEFAULT '[]'::jsonb,
    goal_achievement text,
    process_quality text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX task_reflections_task_id_idx ON task_reflections(task_id);

-- +goose Down
DROP TABLE task_reflections;