# Data model review — 2026-10-22

Read from `supabase/schema.sql` at `origin/beta` 50f65d16 (37 tables) and the migrations folder (60 files
since April, 14 of them PROD-only). Asked by the maintainer while planning PR 0: is the relational model
getting messy?

## Verdict

Not messy yet. The tables added since August (scrum, meetings, final reviews, events, outbox) are
consistent: uuid keys, named CHECKs instead of enums, explicit delete rules, one concern per table.
The model is drifting in three ways that compound if left alone, and PR 0 adds nothing that worsens
them.

## Findings, most important first

1. **The DDL-as-code file is no longer the truth.** `supabase/schema.sql` lacks the outbox tables
   (`2026-09-30_email_outbox.sql`, `_email_preferences.sql`) and `edu_email_verifications`, and it still
   shows `projects.zoom_url`, `meeting_day`, `meeting_time`, dropped on 2026-06-30. Hand-appended blocks
   since July carry the newer tables; the dump itself is from before then.
2. **A tail of dead or soon-dead columns.** `tasks.time_estimate` and `user_stories.time_estimate`
   (the staged contract), `user_stories.archived_at` (the archive concept was dropped; one read rule
   still honours old rows), `sprints.status` (derived from dates after PR 0), `classes.can_students_make_project`
   (never read), and the table `v_user_role` (one `role` column, nothing in `backend/app` or
   `auth_glue.sql` names it; it looks like a view that became a table by accident).
3. **Two generations of delete rules.** Every FK created in April–June has no `ON DELETE` rule: `TSRs`
   (4), `project_join_requests` (4), `attendance` (3), `interest_*` (8), `project_members` (2),
   `roster_entries` (2), `messages`, `conversation_reads`, `conversation_deletes`, `feedback_submissions`,
   `assignments.class_id`. Everything since August chooses CASCADE or SET NULL on purpose. The
   FK-cascade fix (#197) covered part of this; its PROD apply was never confirmed.
4. **One missing foreign key.** `projects.created_by` is `NOT NULL` and indexed but references nothing;
   `assigned_ta_id` and `class_id` do. A deleted creator account leaves a dangling id.
5. **Two wide rows.** `projects` has 22 columns mixing the team, five sponsor fields, the derived
   `num_members`, `final_review_at` and the three dropped meeting columns the file still lists. `classes`
   has 16 and PR 0 makes it 19: it is becoming the class's settings bag (status, review period, review
   Zoom link, external tasks link, end date, sprint schedule).
6. **Naming.** `"TSRs"` and `assignments."Title"` are quoted mixed case; `interest_form` is singular
   beside `interest_submissions`; `roster_entries.course_id` holds a class id.

Things that look like mess but are design: `meetings` holding two shapes under `kind` with conditional
CHECKs; `notifications.entity_type/entity_id` polymorphic; `analytics_daily.class_id` without an FK so
history survives a deleted class; `events.meta` as jsonb limited to ids and enums.

## What PR 0 and the plan-docs PRs add

Three nullable columns and one CHECK on `classes`; `sprints.sequence` with a partial unique index; two
integer columns on `sprint_burnup_days`; later `project_documents` (generic by `kind`),
`project_document_revisions`, `ai_credentials`. All follow the post-August conventions. A separate
`class_sprint_schedules` table was considered for the schedule and rejected: three columns do not earn a
join. If a fourth schedule-like concept lands on `classes`, split a `class_schedule` table then.

## Recommendations, smallest first

- **R1.** Regenerate `supabase/schema.sql` from DEV after PR 0's migrations are applied (schema-only
  dump through `scripts/supabase.sh dev db dump`, Docker needed) and stop hand-appending; make the regen
  a line in the release checklist.
- **R2.** One contract migration after the next release: drop `tasks.time_estimate`,
  `user_stories.time_estimate`, `user_stories.archived_at`, `sprints.status`,
  `classes.can_students_make_project`, and `v_user_role` after `pg_depend` shows nothing depends on it.
- **R3.** Delete rules for the April–June FKs, decided per table (profile deletion → SET NULL on
  authored and `marked_by` columns; project deletion → CASCADE on membership and TSR rows), applied as
  one audited migration, and `projects.created_by` gets a foreign key (ON DELETE SET NULL once the
  column is nullable, else RESTRICT). Verify #197 on PROD first.
- **R4.** Leave the names alone (renaming `TSRs` touches every query) and add no new mixed-case
  identifiers.
- **R5.** Keep secrets in their own service-role-only tables (`scrum_repos.access_token` is the one
  plaintext exception today; `ai_credentials` seals its key).
