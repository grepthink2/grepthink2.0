-- 2026-11-24 — notifications record their class, team, actor and message count
--
-- A notification says what it is about (entity_type, entity_id) but not where it happened or who did it,
-- so the header's panel could not name the person, the team and the class ("Sam Okafor asked to join
-- Trailhead", in CSE 115A) without a read per entity. Four nullable columns record them when the row is
-- written; the list joins the names on read, so a renamed team shows its new name:
--   * class_id: the class it happened in, a team's class or the class itself.
--   * project_id: the team it is about. None for a direct message, a class notice or a reminder.
--   * actor_id: who did it (the sender, the author, the requester, the student who created the team, the
--     member who left or was removed, who handed the document in). None where nobody is named. Not
--     backfilled: it was never recorded.
--   * message_count: on message rows, how many messages the row stands for. A message to a conversation
--     whose row is still unread counts on that row; once it is read, the next message starts a new row
--     at 1. NULL (every row written before this file, and every other type) reads as 1.
-- Each id is ON DELETE SET NULL: a deleted class, team or account leaves the notification without that
-- part of its line, and a partial index on each column serves that cascade. notifications_actor_id_fkey
-- is the table's second key to profiles (user_id is the first), so an embed of the actor names it.
--
-- Backfill, for the rows written before this file whose entity makes the class and team certain:
-- entity_type 'project' (the team), 'class', 'document' (its team), 'conversation' (a team channel's
-- team; a direct message has none) and 'scrum_story' / 'scrum_task' (a mention, whose entity_id is
-- '<project id>:<card id>'). entity_id is text, so only a value shaped like a UUID is cast, and only to a
-- row that exists; anything else stays NULL. One correction: "Member left your project" was filed as
-- join_request, which opens Home's join requests; those rows become member_removed, which opens the team.
--
-- EXPAND, idempotent: a re-run skips the columns and the indexes, drops each foreign key and adds it
-- again by name, and its updates find nothing left to change (each fills only a NULL; the correction
-- leaves no row under the old type). Run the file whole, as one transaction: the SQL editor and
-- scripts/supabase.sh <env> db query --remote -f each do, and SET LOCAL below needs it. Adding nullable
-- columns with no default rewrites no row. No policy and no grant: the browser's SELECT policy and its
-- table-wide grant already cover the new columns. Every updated row reaches an open app over Realtime,
-- which refetches its list once per change, so apply when few people are on. Apply on a database BEFORE
-- the code that writes or reads the columns runs against it: without them, that code's notification
-- writes fail (logged and dropped) and its list answers a database error. The code before it never reads
-- the columns, so applying this early is safe.
--
-- PREFLIGHT (expect no rows; on a re-run, exactly class_id, project_id and actor_id uuid and
-- message_count integer. A column of one of these names with another type means something else got there
-- first: stop and look):
--
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'notifications'
--      AND column_name IN ('class_id', 'project_id', 'actor_id', 'message_count');
--
-- Applied: DEV — 2026-11-24   PROD —

-- Fail fast rather than queue live traffic: the column changes lock notifications until the transaction
-- ends, and adding the foreign keys locks classes, projects and profiles against writes.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS class_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS project_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message_count integer;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_class_id_fkey;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_class_id_fkey
  FOREIGN KEY (class_id) REFERENCES public.classes (id) ON DELETE SET NULL;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_project_id_fkey;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects (id) ON DELETE SET NULL;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_actor_id_fkey;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.profiles (id) ON DELETE SET NULL;

-- The cascades from classes, projects and profiles: deleting one sets its id NULL here.
CREATE INDEX IF NOT EXISTS notifications_class_idx
  ON public.notifications (class_id) WHERE class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_project_idx
  ON public.notifications (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_actor_idx
  ON public.notifications (actor_id) WHERE actor_id IS NOT NULL;

-- The backfill. Each cast sits inside a CASE, which evaluates it only for a value shaped like a UUID: the
-- conditions of a WHERE clause run in whatever order the planner picks, so a shape test beside the cast
-- would not stop it, and casting anything else ('x', a mention's '<project id>:<card id>') fails the file.

-- A team's notices (join requests, a declined request, a new team, a member who left or was removed).
UPDATE public.notifications AS n
   SET project_id = p.id,
       class_id = COALESCE(n.class_id, p.class_id)
  FROM public.projects AS p
 WHERE n.entity_type = 'project'
   AND n.project_id IS NULL
   AND p.id = CASE
                WHEN n.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN n.entity_id::uuid
              END;

-- A class's notices (a late window, the roster reminder, an undeliverable invite).
UPDATE public.notifications AS n
   SET class_id = c.id
  FROM public.classes AS c
 WHERE n.entity_type = 'class'
   AND n.class_id IS NULL
   AND c.id = CASE
                WHEN n.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN n.entity_id::uuid
              END;

-- A document handed in: its team.
UPDATE public.notifications AS n
   SET project_id = p.id,
       class_id = COALESCE(n.class_id, p.class_id)
  FROM public.project_documents AS d
  JOIN public.projects AS p ON p.id = d.project_id
 WHERE n.entity_type = 'document'
   AND n.project_id IS NULL
   AND d.id = CASE
                WHEN n.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN n.entity_id::uuid
              END;

-- A message in a team channel: the channel's team. A direct message has no project_id, so the join
-- leaves it out.
UPDATE public.notifications AS n
   SET project_id = p.id,
       class_id = COALESCE(n.class_id, p.class_id)
  FROM public.conversations AS cv
  JOIN public.projects AS p ON p.id = cv.project_id
 WHERE n.entity_type = 'conversation'
   AND n.project_id IS NULL
   AND cv.id = CASE
                 WHEN n.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 THEN n.entity_id::uuid
               END;

-- A mention on a story or a task: the project before the colon.
UPDATE public.notifications AS n
   SET project_id = p.id,
       class_id = COALESCE(n.class_id, p.class_id)
  FROM public.projects AS p
 WHERE n.entity_type IN ('scrum_story', 'scrum_task')
   AND n.project_id IS NULL
   AND p.id = CASE
                WHEN split_part(n.entity_id, ':', 1)
                     ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN split_part(n.entity_id, ':', 1)::uuid
              END;

-- The correction: a member who left for another team is a member_removed notice.
UPDATE public.notifications
   SET type = 'member_removed'
 WHERE type = 'join_request'
   AND title = 'Member left your project';
