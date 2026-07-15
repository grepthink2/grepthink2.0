-- Group messaging: unified participants model.
-- Spec: docs/superpowers/specs/2026-07-14-group-messaging-and-design-system.md
-- Idempotent; applied manually via Supabase MCP on maintainer go-ahead.

-- ============ 1) conversations: type + project_id ============
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'dm';
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_valid;
ALTER TABLE conversations ADD CONSTRAINT conversations_type_valid
  CHECK (type IN ('dm','team_ta','team_instructor','team_members'));

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE conversations ALTER COLUMN user_a DROP NOT NULL;
ALTER TABLE conversations ALTER COLUMN user_b DROP NOT NULL;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_shape;
ALTER TABLE conversations ADD CONSTRAINT conversations_shape CHECK (
  (type = 'dm' AND user_a IS NOT NULL AND user_b IS NOT NULL AND project_id IS NULL)
  OR (type <> 'dm' AND project_id IS NOT NULL AND user_a IS NULL AND user_b IS NULL)
);

-- One channel of each kind per team. (Existing canonical-order CHECK and
-- UNIQUE(user_a,user_b) pass NULL-safely for team rows.)
CREATE UNIQUE INDEX IF NOT EXISTS conversations_team_channel_uq
  ON conversations (project_id, type) WHERE type <> 'dm';
CREATE INDEX IF NOT EXISTS conversations_project_idx
  ON conversations (project_id) WHERE project_id IS NOT NULL;

-- ============ 2) participants ============
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('member','ta','instructor')),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_participants_user_idx
  ON conversation_participants (user_id);
GRANT ALL ON TABLE conversation_participants TO anon, authenticated, service_role;

-- ============ 3) keyset-pagination index ============
CREATE INDEX IF NOT EXISTS messages_conv_created_id_idx
  ON messages (conversation_id, created_at DESC, id DESC);

-- ============ 4) provisioning + sync ============
CREATE OR REPLACE FUNCTION provision_team_channels(p_project_id uuid)
RETURNS void AS $$
DECLARE
  v_class_owner uuid;
BEGIN
  INSERT INTO conversations (type, project_id)
  SELECT t, p_project_id
    FROM unnest(ARRAY['team_ta','team_instructor','team_members']) AS t
  ON CONFLICT (project_id, type) WHERE type <> 'dm' DO NOTHING;

  -- members into all three channels
  INSERT INTO conversation_participants (conversation_id, user_id, role)
  SELECT c.id, pm.user_id, 'member'
    FROM conversations c
    JOIN project_members pm ON pm.project_id = p_project_id
   WHERE c.project_id = p_project_id AND c.type <> 'dm'
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  -- TA seat
  INSERT INTO conversation_participants (conversation_id, user_id, role)
  SELECT c.id, p.assigned_ta_id, 'ta'
    FROM conversations c
    JOIN projects p ON p.id = p_project_id
   WHERE c.project_id = p_project_id AND c.type = 'team_ta'
     AND p.assigned_ta_id IS NOT NULL
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  -- instructor seat (class owner)
  SELECT cl.created_by INTO v_class_owner
    FROM projects p JOIN classes cl ON cl.id = p.class_id
   WHERE p.id = p_project_id;
  IF v_class_owner IS NOT NULL THEN
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT c.id, v_class_owner, 'instructor'
      FROM conversations c
     WHERE c.project_id = p_project_id AND c.type = 'team_instructor'
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_projects_provision_channels()
RETURNS trigger AS $$
BEGIN
  PERFORM provision_team_channels(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS projects_provision_channels ON projects;
CREATE TRIGGER projects_provision_channels
AFTER INSERT ON projects
FOR EACH ROW EXECUTE FUNCTION trg_projects_provision_channels();

CREATE OR REPLACE FUNCTION trg_project_members_sync()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM provision_team_channels(NEW.project_id);
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT c.id, NEW.user_id, 'member'
      FROM conversations c
     WHERE c.project_id = NEW.project_id AND c.type <> 'dm'
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM conversation_participants cp
     USING conversations c
     WHERE cp.conversation_id = c.id
       AND c.project_id = OLD.project_id AND c.type <> 'dm'
       AND cp.user_id = OLD.user_id AND cp.role = 'member';
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS project_members_sync_channels ON project_members;
CREATE TRIGGER project_members_sync_channels
AFTER INSERT OR DELETE ON project_members
FOR EACH ROW EXECUTE FUNCTION trg_project_members_sync();

CREATE OR REPLACE FUNCTION trg_projects_ta_swap()
RETURNS trigger AS $$
BEGIN
  IF NEW.assigned_ta_id IS DISTINCT FROM OLD.assigned_ta_id THEN
    DELETE FROM conversation_participants cp
     USING conversations c
     WHERE cp.conversation_id = c.id
       AND c.project_id = NEW.id AND c.type = 'team_ta' AND cp.role = 'ta';
    IF NEW.assigned_ta_id IS NOT NULL THEN
      PERFORM provision_team_channels(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS projects_ta_swap_channel ON projects;
CREATE TRIGGER projects_ta_swap_channel
AFTER UPDATE OF assigned_ta_id ON projects
FOR EACH ROW EXECUTE FUNCTION trg_projects_ta_swap();

CREATE OR REPLACE FUNCTION trg_classes_owner_swap()
RETURNS trigger AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    DELETE FROM conversation_participants cp
     USING conversations c, projects p
     WHERE cp.conversation_id = c.id AND c.type = 'team_instructor'
       AND c.project_id = p.id AND p.class_id = NEW.id AND cp.role = 'instructor';
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT c.id, NEW.created_by, 'instructor'
      FROM conversations c JOIN projects p ON p.id = c.project_id
     WHERE c.type = 'team_instructor' AND p.class_id = NEW.id
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS classes_owner_swap_channel ON classes;
CREATE TRIGGER classes_owner_swap_channel
AFTER UPDATE OF created_by ON classes
FOR EACH ROW EXECUTE FUNCTION trg_classes_owner_swap();

-- DM participant rows for every creation path (backend, manual, etc.)
CREATE OR REPLACE FUNCTION trg_dm_participants()
RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'dm' THEN
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (NEW.id, NEW.user_a, 'member'), (NEW.id, NEW.user_b, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS conversations_dm_participants ON conversations;
CREATE TRIGGER conversations_dm_participants
AFTER INSERT ON conversations
FOR EACH ROW EXECUTE FUNCTION trg_dm_participants();

-- ============ 5) backfill ============
INSERT INTO conversation_participants (conversation_id, user_id, role)
SELECT id, user_a, 'member' FROM conversations
 WHERE type = 'dm' AND user_a IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO conversation_participants (conversation_id, user_id, role)
SELECT id, user_b, 'member' FROM conversations
 WHERE type = 'dm' AND user_b IS NOT NULL
ON CONFLICT DO NOTHING;
SELECT provision_team_channels(id) FROM projects;

-- ============ 6) RLS (SELECT-only; writes stay service-role) ============
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_participants_select_own ON conversation_participants;
-- NOTE: keep this policy self-reference-free (plain user_id check) —
-- a participants policy that queries participants recurses and errors.
CREATE POLICY conversation_participants_select_own ON conversation_participants
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS conversations_select_participant ON conversations;
CREATE POLICY conversations_select_participant ON conversations
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM conversation_participants cp
     WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS messages_select_participant ON messages;
CREATE POLICY messages_select_participant ON messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM conversation_participants cp
     WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
  ));

-- ============ 7) inbox RPC ============
CREATE OR REPLACE FUNCTION messages_inbox(p_user uuid)
RETURNS TABLE (
  id uuid, type text, project_id uuid, team_name text,
  created_at timestamptz, last_message_at timestamptz,
  unread_count bigint, my_last_read_at timestamptz,
  last_message jsonb, participants jsonb, can_send boolean
)
LANGUAGE sql STABLE AS $$
WITH my_convs AS (
  SELECT c.*
    FROM conversations c
    JOIN conversation_participants me
      ON me.conversation_id = c.id AND me.user_id = p_user
    LEFT JOIN conversation_deletes cd
      ON cd.conversation_id = c.id AND cd.user_id = p_user
   WHERE (cd.deleted_at IS NULL OR c.last_message_at > cd.deleted_at)
),
my_classes AS (
  SELECT class_id FROM class_enrollments WHERE user_id = p_user
  UNION
  SELECT id FROM classes WHERE created_by = p_user
)
SELECT
  c.id, c.type, c.project_id, p.name AS team_name,
  c.created_at, c.last_message_at,
  COALESCE(un.cnt, 0) AS unread_count,
  r.last_read_at AS my_last_read_at,
  lm.msg AS last_message,
  parts.arr AS participants,
  CASE
    WHEN c.type <> 'dm' THEN true
    ELSE (
      NOT (
        (SELECT role FROM profiles WHERE id = p_user) = 'instructor'
        AND (SELECT role FROM profiles WHERE id = other_id.uid) = 'instructor'
      )
      AND EXISTS (
        SELECT 1 FROM my_classes mc
         WHERE mc.class_id IN (
           SELECT class_id FROM class_enrollments WHERE user_id = other_id.uid
           UNION
           SELECT id FROM classes WHERE created_by = other_id.uid
         )
      )
    )
  END AS can_send
FROM my_convs c
LEFT JOIN projects p ON p.id = c.project_id
LEFT JOIN conversation_reads r
  ON r.conversation_id = c.id AND r.user_id = p_user
LEFT JOIN LATERAL (
  SELECT count(*) AS cnt FROM messages m
   WHERE m.conversation_id = c.id AND m.sender_id <> p_user
     AND m.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
) un ON true
LEFT JOIN LATERAL (
  SELECT to_jsonb(x) AS msg FROM (
    SELECT m.id, m.sender_id, m.body, m.created_at
      FROM messages m WHERE m.conversation_id = c.id
     ORDER BY m.created_at DESC, m.id DESC LIMIT 1
  ) x
) lm ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
           'id', pr.id, 'role', cp.role, 'email', pr.email,
           'first_name', pr.first_name, 'last_name', pr.last_name,
           'image_url', pr.image_url, 'last_read_at', cr.last_read_at
         ) ORDER BY cp.role, pr.first_name) AS arr
    FROM conversation_participants cp
    JOIN profiles pr ON pr.id = cp.user_id
    LEFT JOIN conversation_reads cr
      ON cr.conversation_id = c.id AND cr.user_id = cp.user_id
   WHERE cp.conversation_id = c.id
) parts ON true
LEFT JOIN LATERAL (
  SELECT CASE WHEN c.type = 'dm' THEN
           CASE WHEN c.user_a = p_user THEN c.user_b ELSE c.user_a END
         END AS uid
) other_id ON true
WHERE
  (c.type = 'dm' AND c.last_message_at IS NOT NULL)
  OR c.type IN ('team_members','team_instructor')
  OR (c.type = 'team_ta' AND (
        c.last_message_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM conversation_participants tp
                    WHERE tp.conversation_id = c.id AND tp.role = 'ta')))
ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
LIMIT 200;
$$;
