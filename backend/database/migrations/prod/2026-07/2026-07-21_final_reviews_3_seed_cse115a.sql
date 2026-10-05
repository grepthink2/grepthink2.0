-- ═══════════════════════════════════════════════════════════════════════════
-- PROD STAGING 3/3 — CSE115A final-review seed           (run AFTER 1/3)
-- Target: GrepThink2-PROD (yfezwtoeoexfksvbpxmi)   ⚠ NOT YET APPLIED
-- ═══════════════════════════════════════════════════════════════════════════
-- Class: "2026Su cse115a"  ca9b1627-bb0c-4a88-8e61-32341863033f
--        (instructor rjullig@ucsc.edu = 005adfbb-e43a-44f1-a3f7-94a99f952d2b)
--
-- Every sheet name was resolved against prod on 2026-07-21 and matched exactly
-- one of the class's 15 projects (sheet "Ascent" is DB "SuperMogBattle"); all
-- three reviewers are enrolled class TAs, and every seeded Review TA differs
-- from that team's Home TA (both enforced by the backend). Home TAs
-- (projects.assigned_ta_id) are NOT touched.
--
-- TAs:  Scott    okdogulu@ucsc.edu  268467ce-54d8-4629-beec-1111ca04c01a
--       Farzaneh frabieik@ucsc.edu  1a3d536d-b12c-4784-bc63-63c984e20977
--       Pranay   pmundra@ucsc.edu   adfa5354-8933-4f30-a4b8-73718f553f5c
--
-- All wall-clock times are America/Los_Angeles (PDT, UTC-7 on these dates).
-- Idempotent: re-running refreshes times and reviewer appointments. It never
-- DELETEs, so a later hand-made claim survives a re-run (upsert on project_id).
-- The review window (classes.review_period_open) is left untouched.

BEGIN;

-- ── Shared Zoom room (one per class) ────────────────────────────────────────
UPDATE public.classes
   SET review_zoom_url = 'https://ucsc.zoom.us/j/9853310925?pwd=RjZEbG9PaDdsSGxIc1pyNC9zYXJLdz09'
 WHERE id = 'ca9b1627-bb0c-4a88-8e61-32341863033f';

-- ── Per-team review slots ───────────────────────────────────────────────────
UPDATE public.projects AS p
   SET final_review_at = v.at_local AT TIME ZONE 'America/Los_Angeles'
  FROM (VALUES
    -- Wednesday, July 22
    ('53247007-e61e-44d6-be81-2c8201d2fc5c'::uuid, TIMESTAMP '2026-07-22 13:00'),  -- VeriFi
    ('5f7760a0-851e-4321-bfce-2714dc23442a'::uuid, TIMESTAMP '2026-07-22 14:00'),  -- Wayfinder
    ('d7478ae9-e46b-4d4c-a8ef-ac5acb048563'::uuid, TIMESTAMP '2026-07-22 16:00'),  -- CS Life
    ('9c2cbb7f-020d-45d5-8fc1-ed096e2436c2'::uuid, TIMESTAMP '2026-07-22 17:00'),  -- Wheel Time
    ('d6ffcd6b-36dc-4435-b5d4-17d307d94a5b'::uuid, TIMESTAMP '2026-07-22 18:00'),  -- SlugSync
    -- Thursday, July 23
    ('22cf652c-e7a7-4509-9ec0-fe856a82e112'::uuid, TIMESTAMP '2026-07-23 08:00'),  -- Medune
    ('8763e71f-e1aa-4d5d-85f0-62bc9d578df2'::uuid, TIMESTAMP '2026-07-23 09:00'),  -- SuperMogBattle (sheet "Ascent")
    ('2b36b2ba-ea43-4766-a18b-223078f43e2f'::uuid, TIMESTAMP '2026-07-23 10:00'),  -- TaskFlask
    ('19d014d3-8512-4e89-9fec-b4f9d87f74c0'::uuid, TIMESTAMP '2026-07-23 11:00'),  -- AI Powered Stock Trading Platform
    -- Friday, July 24
    ('92717921-d88b-4fb5-8abe-5cc93922a9ea'::uuid, TIMESTAMP '2026-07-24 11:00'),  -- Amblyopia Interactive Games
    ('451b877a-d0ff-4cfe-ac34-8a328d5a0820'::uuid, TIMESTAMP '2026-07-24 12:00'),  -- alexandria
    ('38ea537b-bd8d-4f43-b9e9-4759f0c5dabb'::uuid, TIMESTAMP '2026-07-24 13:00'),  -- Fengshui Rater
    ('aa261f9f-94a0-40d8-8dfc-6ffe3ee173b6'::uuid, TIMESTAMP '2026-07-24 15:00'),  -- LENS - A web-based public safety intelligence
    ('a7d1898e-4c52-4764-bb3b-4765a5048077'::uuid, TIMESTAMP '2026-07-24 16:00'),  -- StudyPet+ AI Study Planner
    ('07fedcf3-4aad-4e57-b037-bc32ed74fa90'::uuid, TIMESTAMP '2026-07-24 17:00')   -- Grooveboxd
  ) AS v(project_id, at_local)
 WHERE p.id = v.project_id
   AND p.class_id = 'ca9b1627-bb0c-4a88-8e61-32341863033f';

-- ── Review-TA appointments (instructor-appointed; all 15 teams) ─────────────
INSERT INTO public.project_review_tas (class_id, project_id, user_id, assigned_by)
VALUES
  -- Wednesday, July 22
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', '53247007-e61e-44d6-be81-2c8201d2fc5c', '268467ce-54d8-4629-beec-1111ca04c01a', '005adfbb-e43a-44f1-a3f7-94a99f952d2b'),  -- VeriFi        → Scott
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', '5f7760a0-851e-4321-bfce-2714dc23442a', 'adfa5354-8933-4f30-a4b8-73718f553f5c', '005adfbb-e43a-44f1-a3f7-94a99f952d2b'),  -- Wayfinder     → Pranay
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', 'd7478ae9-e46b-4d4c-a8ef-ac5acb048563', '1a3d536d-b12c-4784-bc63-63c984e20977', '005adfbb-e43a-44f1-a3f7-94a99f952d2b'),  -- CS Life       → Farzaneh
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', '9c2cbb7f-020d-45d5-8fc1-ed096e2436c2', '1a3d536d-b12c-4784-bc63-63c984e20977', '005adfbb-e43a-44f1-a3f7-94a99f952d2b'),  -- Wheel Time    → Farzaneh
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', 'd6ffcd6b-36dc-4435-b5d4-17d307d94a5b', '1a3d536d-b12c-4784-bc63-63c984e20977', '005adfbb-e43a-44f1-a3f7-94a99f952d2b'),  -- SlugSync      → Farzaneh
  -- Thursday, July 23
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', '22cf652c-e7a7-4509-9ec0-fe856a82e112', '268467ce-54d8-4629-beec-1111ca04c01a', '005adfbb-e43a-44f1-a3f7-94a99f952d2b'),  -- Medune        → Scott
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', '8763e71f-e1aa-4d5d-85f0-62bc9d578df2', '268467ce-54d8-4629-beec-1111ca04c01a', '005adfbb-e43a-44f1-a3f7-94a99f952d2b'),  -- SuperMogBattle→ Scott
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', '2b36b2ba-ea43-4766-a18b-223078f43e2f', '268467ce-54d8-4629-beec-1111ca04c01a', '005adfbb-e43a-44f1-a3f7-94a99f952d2b'),  -- TaskFlask     → Scott
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', '19d014d3-8512-4e89-9fec-b4f9d87f74c0', '268467ce-54d8-4629-beec-1111ca04c01a', '005adfbb-e43a-44f1-a3f7-94a99f952d2b'),  -- AI Stock      → Scott
  -- Friday, July 24
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', '92717921-d88b-4fb5-8abe-5cc93922a9ea', '1a3d536d-b12c-4784-bc63-63c984e20977', '005adfbb-e43a-44f1-a3f7-94a99f952d2b'),  -- Amblyopia     → Farzaneh
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', '451b877a-d0ff-4cfe-ac34-8a328d5a0820', 'adfa5354-8933-4f30-a4b8-73718f553f5c', '005adfbb-e43a-44f1-a3f7-94a99f952d2b'),  -- alexandria    → Pranay
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', '38ea537b-bd8d-4f43-b9e9-4759f0c5dabb', '1a3d536d-b12c-4784-bc63-63c984e20977', '005adfbb-e43a-44f1-a3f7-94a99f952d2b'),  -- Fengshui Rater→ Farzaneh (added 2026-07-22 from schedule sheet)
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', 'aa261f9f-94a0-40d8-8dfc-6ffe3ee173b6', '1a3d536d-b12c-4784-bc63-63c984e20977', '005adfbb-e43a-44f1-a3f7-94a99f952d2b'),  -- LENS          → Farzaneh
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', 'a7d1898e-4c52-4764-bb3b-4765a5048077', 'adfa5354-8933-4f30-a4b8-73718f553f5c', '005adfbb-e43a-44f1-a3f7-94a99f952d2b'),  -- StudyPet+     → Pranay
  ('ca9b1627-bb0c-4a88-8e61-32341863033f', '07fedcf3-4aad-4e57-b037-bc32ed74fa90', 'adfa5354-8933-4f30-a4b8-73718f553f5c', '005adfbb-e43a-44f1-a3f7-94a99f952d2b')   -- Grooveboxd    → Pranay
ON CONFLICT ON CONSTRAINT project_review_tas_project_unique
DO UPDATE SET user_id = EXCLUDED.user_id,
              assigned_by = EXCLUDED.assigned_by,
              claimed_at = now();

COMMIT;

-- ── Post-run verification (read-only) ───────────────────────────────────────
-- Expect 15 rows ordered Wed 1pm → Fri 5pm; review_ta set on all 15;
-- zoom set on every row.
--
-- SELECT p.name,
--        p.final_review_at AT TIME ZONE 'America/Los_Angeles' AS slot_pt,
--        hp.email AS home_ta, rp.email AS review_ta, c.review_zoom_url
--   FROM projects p
--   JOIN classes c        ON c.id = p.class_id
--   LEFT JOIN profiles hp ON hp.id = p.assigned_ta_id
--   LEFT JOIN project_review_tas rt ON rt.project_id = p.id
--   LEFT JOIN profiles rp ON rp.id = rt.user_id
--  WHERE p.class_id = 'ca9b1627-bb0c-4a88-8e61-32341863033f'
--  ORDER BY p.final_review_at;
