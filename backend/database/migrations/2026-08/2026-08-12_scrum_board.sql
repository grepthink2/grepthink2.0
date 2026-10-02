-- Scrum board: sprints → user stories → tasks, move audit, comments,
-- per-project keys, burnup snapshots, AI-draft quota.
-- Spec: docs/superpowers/specs/2026-08-12-scrum-board-design.md
-- Idempotent; applied manually via Supabase MCP (dev first) on maintainer go-ahead.
-- RLS on, no policies: service-role backend only (final_review_scoring precedent).
-- Realtime upgrade checklist (NOT done in v1): REPLICA IDENTITY FULL on
-- tasks/scrum_comments, participant-scoped SELECT policies, add tables to the
-- realtime publication in the dashboard.

-- ============ 1) project setting ============
ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimate_scale text NOT NULL DEFAULT 'fibonacci';
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_estimate_scale_valid;
ALTER TABLE projects ADD CONSTRAINT projects_estimate_scale_valid
  CHECK (estimate_scale IN ('linear','exponential','fibonacci'));

-- ============ 2) sprints ============
CREATE TABLE IF NOT EXISTS sprints (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  starts_at  date NOT NULL,
  ends_at    date NOT NULL,
  status     text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sprints_status_valid CHECK (status IN ('planned','active','completed')),
  CONSTRAINT sprints_dates_valid  CHECK (ends_at >= starts_at)
);
CREATE INDEX IF NOT EXISTS sprints_project_idx ON sprints (project_id, starts_at);
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE sprints TO anon, authenticated, service_role;

-- ============ 3) user_stories ============
CREATE TABLE IF NOT EXISTS user_stories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_id      uuid REFERENCES sprints(id) ON DELETE SET NULL,  -- NULL ⇒ backlog
  key            text NOT NULL,                                   -- "US-3"
  title          text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description_md text CHECK (char_length(description_md) <= 20000),
  points         integer CHECK (points > 0),
  time_estimate  text CHECK (char_length(time_estimate) <= 20),
  reporter_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignee_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  archived_at    timestamptz,                                     -- set ⇒ archive view
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_stories_key_uq UNIQUE (project_id, key)
);
CREATE INDEX IF NOT EXISTS user_stories_project_sprint_idx ON user_stories (project_id, sprint_id);
ALTER TABLE user_stories ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE user_stories TO anon, authenticated, service_role;

-- ============ 4) tasks ============
CREATE TABLE IF NOT EXISTS tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id       uuid NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key            text NOT NULL,                                   -- "GT-12"
  title          text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description_md text CHECK (char_length(description_md) <= 20000),
  points         integer CHECK (points > 0),
  time_estimate  text CHECK (char_length(time_estimate) <= 20),
  status         text NOT NULL DEFAULT 'todo',
  reporter_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignee_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tags           text[] NOT NULL DEFAULT '{}',
  pr_url         text CHECK (char_length(pr_url) <= 500),
  pr_provider    text,
  pr_state       text,
  pr_checked_at  timestamptz,
  moved_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  moved_at       timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_key_uq          UNIQUE (project_id, key),
  CONSTRAINT tasks_status_valid    CHECK (status IN ('todo','in_progress','done')),
  CONSTRAINT tasks_provider_valid  CHECK (pr_provider IS NULL OR pr_provider IN ('github','gitlab')),
  CONSTRAINT tasks_pr_state_valid  CHECK (pr_state IS NULL OR pr_state IN ('open','merged','closed','draft')),
  CONSTRAINT tasks_tags_valid      CHECK (tags <@ ARRAY['backend','frontend','ui/ux','infra','design','research','bug','chore','optimization','docs']::text[])
);
CREATE INDEX IF NOT EXISTS tasks_story_idx          ON tasks (story_id);
CREATE INDEX IF NOT EXISTS tasks_project_status_idx ON tasks (project_id, status);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE tasks TO anon, authenticated, service_role;

-- ============ 5) task_moves + apply trigger ============
CREATE TABLE IF NOT EXISTS task_moves (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status   text NOT NULL CHECK (to_status IN ('todo','in_progress','done')),
  moved_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  moved_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_moves_task_idx ON task_moves (task_id, moved_at DESC);
ALTER TABLE task_moves ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE task_moves TO anon, authenticated, service_role;

-- The controller inserts ONLY (task_id, to_status, moved_by); this trigger reads the
-- task's current status into from_status and applies the move — one INSERT is atomic,
-- standing in for the transaction supabase-py can't give us.
CREATE OR REPLACE FUNCTION scrum_apply_task_move() RETURNS trigger AS $$
BEGIN
  SELECT status INTO NEW.from_status FROM tasks WHERE id = NEW.task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task % not found', NEW.task_id; END IF;
  UPDATE tasks SET status = NEW.to_status, moved_by = NEW.moved_by,
                   moved_at = NEW.moved_at, updated_at = NEW.moved_at
   WHERE id = NEW.task_id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS task_moves_apply ON task_moves;
CREATE TRIGGER task_moves_apply BEFORE INSERT ON task_moves
  FOR EACH ROW EXECUTE FUNCTION scrum_apply_task_move();

-- ============ 6) comments (story XOR task) ============
CREATE TABLE IF NOT EXISTS scrum_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id   uuid REFERENCES user_stories(id) ON DELETE CASCADE,
  task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body_md    text NOT NULL CHECK (char_length(body_md) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scrum_comments_parent_xor CHECK (num_nonnulls(story_id, task_id) = 1)
);
CREATE INDEX IF NOT EXISTS scrum_comments_story_idx ON scrum_comments (story_id, created_at);
CREATE INDEX IF NOT EXISTS scrum_comments_task_idx  ON scrum_comments (task_id, created_at);
ALTER TABLE scrum_comments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE scrum_comments TO anon, authenticated, service_role;

-- ============ 7) per-project key counters + RPC ============
CREATE TABLE IF NOT EXISTS scrum_counters (
  project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  story_seq  integer NOT NULL DEFAULT 0,
  task_seq   integer NOT NULL DEFAULT 0
);
ALTER TABLE scrum_counters ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE scrum_counters TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION scrum_next_key(p_project_id uuid, p_kind text) RETURNS integer AS $$
DECLARE v integer;
BEGIN
  IF p_kind NOT IN ('story','task') THEN RAISE EXCEPTION 'bad kind %', p_kind; END IF;
  INSERT INTO scrum_counters (project_id) VALUES (p_project_id) ON CONFLICT (project_id) DO NOTHING;
  IF p_kind = 'story' THEN
    UPDATE scrum_counters SET story_seq = story_seq + 1 WHERE project_id = p_project_id RETURNING story_seq INTO v;
  ELSE
    UPDATE scrum_counters SET task_seq = task_seq + 1 WHERE project_id = p_project_id RETURNING task_seq INTO v;
  END IF;
  RETURN v;
END; $$ LANGUAGE plpgsql;

-- ============ 8) burnup snapshots ============
CREATE TABLE IF NOT EXISTS sprint_burnup_days (
  sprint_id        uuid NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  day              date NOT NULL,          -- America/Los_Angeles calendar day
  scope_points     integer NOT NULL,
  completed_points integer NOT NULL,
  PRIMARY KEY (sprint_id, day)
);
ALTER TABLE sprint_burnup_days ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE sprint_burnup_days TO anon, authenticated, service_role;

-- ============ 9) AI-draft quota ============
CREATE TABLE IF NOT EXISTS ai_draft_usage (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  used_on date NOT NULL,
  count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, used_on)
);
ALTER TABLE ai_draft_usage ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE ai_draft_usage TO anon, authenticated, service_role;
