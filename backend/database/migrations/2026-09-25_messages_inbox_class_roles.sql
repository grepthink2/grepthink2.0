-- 2026-09-25 — the inbox's can_send follows shared classes only
--
-- Applied: DEV 2026-09-25 (by the maintainer)   PROD ____-__-__
--
-- Safe on either side of the code deploy: only the value of `can_send` changes. That column only
-- decides whether the web client enables a thread's composer; POST /api/messages runs
-- can_message() itself on every send, so what the server allows never depended on it. One file
-- for DEV and PROD: both run the function from 2026-07-14_group_messaging.sql (PROD through
-- prod/2026-09-20_align_prod.sql, byte-identical). Idempotent. Update supabase/schema.sql once
-- this is applied (AGENTS.md).
--
-- Applied on PROD before the per-class-roles release, it runs ahead of the code there: the old
-- can_message() still refuses a DM between two accounts whose profiles.role is 'instructor', so
-- such a pair sees an enabled composer whose send answers 403 until the release is live.
-- Harmless (the server still enforces its own rule), and gone once the new code is deployed.
--
-- ⚠️  ORDER: apply it on PROD before prod/2026-09-25_scott_class_creation.sql. Once Scott's
--     account is an instructor, the function this replaces disables the composer of their DM
--     with the UCSC instructor they TA for, although the backend allows the send.
--
-- Before applying, run the Check at the end on its own: body_hash must be a434e227, the function
-- from 2026-07-14_group_messaging.sql. Any other value means the live function was changed since;
-- compare it with that file before replacing it.
--
-- public.messages_inbox() set can_send = false for a DM between two accounts whose profiles.role
-- is 'instructor'. The backend's can_message() dropped that rule with per-class roles: an
-- instructor account can be a TA in another instructor's class, and the two must be able to
-- talk. Such a TA could send the first DM, but the thread then showed sending disabled. This
-- removes the account-role rule and nothing else: a DM stays sendable only between two people
-- who share a class (as its instructor, a TA or a student), exactly as can_message() decides.
--
-- CREATE OR REPLACE resets a function's SET options, so `SET search_path = public` (added with
-- ALTER FUNCTION by 2026-09-08_perf_indexes_and_lints.sql, Part D) is restated. The return
-- columns, language and volatility are unchanged, as CREATE OR REPLACE requires.
--
-- Roll back: re-run the function from 2026-07-14_group_messaging.sql, then
--   ALTER FUNCTION public.messages_inbox(p_user uuid) SET search_path = public;

CREATE OR REPLACE FUNCTION public.messages_inbox(p_user uuid)
RETURNS TABLE (
  id uuid, type text, project_id uuid, team_name text,
  created_at timestamptz, last_message_at timestamptz,
  unread_count bigint, my_last_read_at timestamptz,
  last_message jsonb, participants jsonb, can_send boolean
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
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
  -- NOTE: mirrors can_message() in backend/app/messages/controller.py (the two share a
  -- class, nothing else) — that function is the authoritative send-time check; keep the
  -- two in sync.
  CASE
    WHEN c.type <> 'dm' THEN true
    ELSE (
      EXISTS (
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

-- Check. Expected after applying: instructor_rule_gone = t, config = {search_path=public},
-- body_hash = daa60cbf (this file's function body, byte for byte).
-- Before applying: instructor_rule_gone = f, body_hash = a434e227 (2026-07-14_group_messaging.sql).
-- body_hash is the first 8 hex of md5(prosrc), as prod/2026-09-20_align_prod.sql computes it.
SELECT pg_get_functiondef(p.oid) NOT LIKE '%''instructor''%' AS instructor_rule_gone,
       p.proconfig                                         AS config,
       left(md5(p.prosrc), 8)                              AS body_hash
  FROM pg_proc p
 WHERE p.oid = 'public.messages_inbox(uuid)'::regprocedure;
