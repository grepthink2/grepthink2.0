# Audit — `backend/app/assignments/`, `app/tas/`, `app/attendance/` (2026-09-08)

> Line numbers refer to commit `613e4d1` (pre-format). Two facts shape every item:
> `query_pool` (`app/database/client.py`, 8 workers) exists and none of these three
> controllers used it; the DB already has the unique constraints needed to replace every
> select-then-write with a real upsert.
> **Done since:** `tas.save_final_review_scores` batched (commit `a88866b`).

## 1. Function map (hot rows)

| Function | Lines | execute() (effective) | loops | authz |
|---|---|---|---|---|
| assignments.get_assignments_for_class | 409-471 | 5 (8 instr / 3 student), all serial | no | inline role + created_by/enrollment |
| assignments.update_tsr_entry | 474-596 | 6 | no | inline evaluator-or-instructor |
| assignments.get_instructor_tsr_overview | 739-851 | 4 (7 instr / 9 TA) | no | _resolve_tsr_overview_access |
| assignments.get_feedback_overview | 969-1067 | 5 (6) | no | _require_class_instructor |
| tas.get_final_review_detail | 754-825 | 4 (8 serial) | no | _load_review_context |
| tas.save_final_review_scores | 839-974 | 6 (5+2N) | YES — **fixed** | ctx + role gate |
| tas.set_review_ta | 450-514 | 3 (8) | no | instructor / TA / window |
| tas.get_ta_review_targets | 313-345 | 1 (3 serial) | no | enrollment_role == ta |
| attendance.get_ta_schedule | 471-612 | 6 (11 serial) | no | _is_instructor + is_class_ta (+ _is_enrolled) |
| attendance.mark_all_present | 752-775 | 1 (5+2N) | YES L766 via `_upsert_one` | _require_meeting_editor |
| attendance.upsert_attendance | 720-749 | 1 (8) | no | same |
| attendance.get_team_attendance | 619-682 | 3 (6) | no | editor or member |

## 2. Hotspots (ranked)

1. **`tas.save_final_review_scores`** — DONE: validate first, one DELETE + one UPSERT on
   `final_review_scores_uniq (project_id, student_id, role)`; 15 → 6 round trips; fixed the
   partial-write-on-400 bug. See `tests/test_final_review_scores_batching.py`.
2. **`attendance.mark_all_present` L752-775 / `_upsert_one` L685-708** — select + write per
   member. `attendance_meeting_slot_uniq (meeting_id, user_id, week_number)` is a full
   unique index → one bulk `upsert(rows, on_conflict="meeting_id,user_id,week_number")`;
   `upsert_attendance` = same helper with one row. 15 → 6. **Do not** apply the same to
   `_get_or_create_meeting` (its unique index is partial `WHERE cadence='weekly'`;
   PostgREST cannot infer it).
3. **`attendance.get_ta_schedule` L471-612** — 11 serial: (a) `is_instr =
   class_row["created_by"] == user_id` instead of `_is_instructor` (duplicate `classes`
   read, L497); (b) one `meetings` read reused for `_current_meeting_in_week` L536 and
   `_meetings_for_projects` L561; (c) members/meetings/profiles in one `query_pool` wave
   (attendance waits for meeting ids). Also add `viewer_status` per team (plan 7e) so the
   frontend's per-team loop (`TAScheduleView.tsx:126-142`) disappears.
4. **`assignments.get_assignments_for_class` L409-471** — three waves: (role, class),
   (assignments, projects, enrollments), (members, TSRs, feedback). Add
   `include=my_submissions` for students (plan 7f).
5. **`tas.get_final_review_detail` L754-825** — `_load_review_context` chain: use
   `core.authz.load_project(class_columns="id, created_by, review_period_open,
   review_zoom_url")` (2 → 1), then review-TA / members / scores / notes in one wave.
6. **`assignments.get_instructor_tsr_overview` L739-851** — TA path reads `projects` twice
   (L80 and L768) and `profiles` twice (L218, L820); one projects read carrying
   `assigned_ta_id`, one profiles read for all ids. 9 → 5.
7. **`assignments.update_tsr_entry` L474-596** — embed
   `projects(class_id, classes(created_by))` in the first read, keep the UPDATE's returned
   row (drop the re-select L563), **select `project_id`** (currently emitted as `None`,
   decision D10). 6 → 3.
8. **`attendance.upsert_attendance` / `get_team_attendance` / `upsert_meeting` /
   `assign_project_ta`** — duplicate `classes` reads (`_require_meeting_editor` →
   `_is_instructor`, then `_validate_slot`). `load_project(class_columns=
   "created_by, term, meetings_per_week, meeting_duration_minutes")` removes 2 per call.
9. **`tas.set_review_ta` L450-514** — three reads of the same class row; DELETE+INSERT
   instead of `upsert(on_conflict="project_id")` on `project_review_tas_project_unique`.
10. **`tas.get_ta_review_targets`** — 3 serial → one wave.
11. **`assignments.get_feedback_overview`** — `profiles` read twice; enrollments +
    submissions in one wave. 6 → 4.
12. Frontend amplifier: `TAScheduleView.tsx:131-137` sequential `await` per team.

## 3. Duplicated logic → `app/core/authz.py` (now exists)

- Instructor check ×5 (+1 inline) with three status codes: `assignments._require_class_instructor`
  L32 (404), inline L423-431 (403), `tas._require_class_instructor` L50 (403, returns row),
  `tas._is_class_instructor` L270, `attendance._require_class_instructor` L159 (unused
  `client` param), `staffing._require_class_instructor` L53 (404).
- Enrollment ×3: `tas._get_enrollment`/`get_enrollment_role` L68-84,
  `attendance._is_enrolled` L126 (weaker), `attendance.is_class_ta` L116 (reversed arg order).
  Argument order differs across four helpers — a refactor footgun.
- `_load_project` ×2 (tas L257, attendance L135) → `core.authz.load_project`.
- Display name: `attendance` hand-rolls `profile_display_name` three times (L295, L577/587,
  L650/668) and returns `None` instead of `""`.
- Two "list class TAs" endpoints with near-identical names and types (`ApiClassTA` vs
  `ApiClassTa`).
- Timezone: `attendance` uses `ZoneInfo("America/Los_Angeles")` correctly but (1) falls back
  silently to naive server time if `tzdata` is missing; (2) `_current_term_week` L99 uses
  `date.today()` (server-local) while `_current_meeting_in_week` L448 is Pacific — fix with
  `datetime.now(_CLASS_TZ).date()`; (3) `assignments` L899 uses naive `utcnow()`.

## 4. Error handling

- None of the three files leak raw exception text (contrast projects).
- `projects._is_instructor` → `None` on error flows into every attendance authz decision
  (403 instead of 500 on a DB blip).
- `attendance.get_team_attendance` L629-633 catches any `HTTPException` to decide
  `is_editor`.
- Synthetic success records when a write returns no rows (attendance L228, L378, L706,
  L708); L228's fallback lacks `id` → KeyError → generic 500.
- Same-file status split: `assignments` L43 (404) vs L431 (403) for "not your class".
- `@retry_on_disconnect` only on `get_my_tsr_entries`.
- Silent RLS fallback when the service key is missing turns into diffuse 404/403s.
- Validation gaps: `UpdateTSREntryRequest.percent_contribution` unbounded;
  `SaveFinalReviewScoresRequest.role` plain `str` (should be `Literal`);
  `meetings_per_week` bounds in controller not model; `week_number` validated via a DB read.

## 5. Dead / suspicious

- `assignments.get_tsr_responses_about_user` L669-736 (route
  `GET /api/assignments/{id}/tsrs/about/{evaluatee_id}`): zero callers. Decision D5: keep.
- `tas.list_project_review_tas` L391-447: only its test calls it.
- `attendance._term_max_weeks` L65: used only by a test; drags in imports from classes.
- Ignored `role` parameters in `attendance.list_class_tas` L256 and `get_ta_schedule`
  L471 — `views.py` computes `get_user_role` four times for nothing.
- Stale docstrings: `assignments/views.py` L93 and `api.ts` L1176 say instructor-only (TAs
  are allowed); `update_tsr_entry` L494 claims the same shape but emits `project_id: None`.
- Non-atomic multi-step writes (worst first): `tas.demote_ta` L158-170 (a failure after
  step 1 leaves a demoted TA still `assigned_ta_id` → still able to edit meetings/attendance);
  `set_review_ta` delete+insert; `mark_all_present` loop (fix pending); check-then-act in
  `_get_or_create_meeting` / `_upsert_one`; `update_assignment` read-modify-write.
- **No `test_assignments*.py` exists** — write it before moving assignment authz.

## 6. Response shapes (preserve)

- `get_assignments_for_class` → `{"assignments": [raw row + optional has_tsr_responses,
  teams_total, teams_submitted (tsr) | feedback_submitted, feedback_total (feedback)]}` —
  keys absent (not 0) when the class has no assignment of that type; students get bare
  published rows.
- `get_feedback_overview` → `{assignment{7 cols}, submissions[10 keys], submitted_count,
  total_count, non_submitters[{id,name}]}`.
- `get_instructor_tsr_overview` → `{assignment, projects[{id,name}], entries[TSR entry
  shape: tsr_id,evaluator_id,evaluatee_id,project_id,evaluator_name,evaluatee_name,
  percent_contribution,positive_feedback,constructive_feedback,scrum_master_tickets,
  scrum_master_assessment,scrum_master_notes], non_submitters_by_project{pid:[{id,name}]}}`.
- `get_final_review_schedule` → `{class_id, review_zoom_url, review_period_open,
  my_review_count, teams[{project_id,name,final_review_at,home_ta{user_id,name,email},
  review_ta{...,claimed_at}}]}` sorted by time then name.
- `get_final_review_detail` → `{project{project_id,name,final_review_at}, review_zoom_url,
  review_period_open, home_ta, review_ta, members[{user_id,name,email}], scores[all roles],
  notes|null, viewer_role}`.
- `get_ta_schedule` → meta (`class_id, week_number, total_weeks, week_of, meeting_in_week,
  meetings_per_week, meeting_duration_minutes, total_meetings`) + `teams[{project_id,
  project_name, meeting_id (undeclared in TS), meeting_day, meeting_time (pre-formatted
  "9:00 AM"), zoom_url, assigned_ta{id,name,email,image_url}, attendance_present,
  attendance_total}]`.
- `get_team_attendance` → `{project_id, week_number, meeting_in_week, entries[{person_id,
  name,email,image_url,status}]}`; non-editors get a single-element list (themselves) —
  `TAScheduleView` relies on `entries[0]`.
