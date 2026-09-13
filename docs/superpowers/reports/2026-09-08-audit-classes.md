# Audit — `backend/app/classes/` (2026-09-08)

> Line numbers refer to commit `613e4d1` (before the ruff formatting commit `1281d48`).
> Use `git show 613e4d1:backend/app/classes/controller.py` or search by function name.
> Query counts are direct `.execute()` calls; parenthesised totals include helper calls.
> Helper costs: `_find_student_profile_by_email`=2, `_class_invite_email_context`=1,
> `_enrollment_counts_by_class`=1, `_generate_tsr_assignments`=1,
> `_purge_student_from_class`=7+2M, `_increment_project_num_members`=2.

## 1. Function map (controller.py)

| Function | Lines | execute() | loops w/ queries | authz |
|---|---|---|---|---|
| create_class | 263-335 | 3 (4) | YES L285-290 (course-code probe) | views.require_instructor |
| _enrollment_counts_by_class | 338-358 | 1 | no | helper |
| get_classes_for_user | 366-426 | 3 (4) | no | scoped by created_by / user_id |
| update_class_status | 429-478 | 2 | no | inline created_by L440-446 |
| get_class_by_id | 481-506 | 1 | no | **NONE — any authenticated user reads any class (incl. course_code, the join secret)** |
| join_class_by_code | 509-561 | 3 | no | role gate in views |
| invite_student_to_class | 564-654 | 3 (6) | no | inline created_by L576-582 |
| get_class_students | 657-768 | 5 | no | inline owner-or-enrolled L706-708 |
| get_class_roster | 771-946 | 6 | no | inline owner-or-enrolled L820-822 |
| get_class_roster_timeline | 949-1091 | 6 (all sequential) | no | inline created_by L963-969 |
| _remove_dropped_roster_students_from_teams | 1094-1185 | 6 (4 + ~4/row) | YES L1145-1174 | caller |
| upload_class_roster | 1188-1288 | 5 (+helpers) | YES L1215-1239 (batched by 50) | inline created_by L1198-1204 |
| add_manual_roster_student | 1291-1373 | 3 (5) | no | inline created_by |
| delete_manual_roster_entry | 1376-1428 | 3 | no | inline created_by |
| _purge_student_from_class | 1431-1498 | 9 (7+2M) | YES L1468-1477 | caller |
| remove_student_from_class / leave_class | 1501-1571 | 1 (8+2M) each | no | inline |
| bulk_invite_students | 1574-1684 | 3 (2+4·N) | YES L1608-1667 | inline created_by L1589-1595 |
| queue_invite / cancel_invite | 1686-1768 | 2 each | no | inline |
| get_class_projects | 1771-1927 | 5 | no | inline owner-or-enrolled L1825-1836 |
| get_class_projects_overview | 1940-2096 | 5 | no | inline owner-or-enrolled L1994-1999 |
| get_class_turn_in_stats | 2099-2243 | 5 (sequential) | no | inline created_by L2112-2118 (**403**, others use 404) |

## 2. N+1 and waterfall hotspots (ranked)

1. **`bulk_invite_students` L1608-1667** — per email (30-100): 2 profile lookups
   (`_find_student_profile_by_email`: edu_email then email), enrollment check, single-row
   insert → ~400 sequential calls + 100 synchronous SMTP sends. Rewrite: one
   `.or_('edu_email.in.(...),email.in.(...)')` profile read, one enrollment read
   (`.in_('user_id', ...)`), one bulk insert; email via the `pending_invites` queue.
2. **`_remove_dropped_roster_students_from_teams` L1145-1174** — per dropped member
   (10-30): re-reads the team, deletes one row, read-modify-write `num_members`, one
   notification insert per teammate → 90-270 calls, triggered from `upload_class_roster`
   L1276. Rewrite: one members read (`.in_('project_id')`), one bulk delete, conditional
   decrements, one bulk notifications insert (~6 calls).
3. **`get_class_roster_timeline` L949-1091** — six strictly sequential reads (class →
   enrollments → roster → projects → profiles → members). Use two `query_pool` waves and
   embeds (`profiles!class_enrollments_user_id_fkey(...)`,
   `profiles!roster_entries_matched_profile_id_fkey(...)`). FK names: schema.sql L928, L1058,
   L1063, L1103.
4. **`invite_student_to_class` L564-654** — 6 sequential; class+instructor via
   `profiles!classes_created_by_fkey` embed, single `.or_` profile lookup, upsert on the
   `(class_id,user_id)` unique key → 3.
5. **`_purge_student_from_class` L1468-1477** — per affected project: select num_members +
   update. Delete returns rows (`.delete()...execute().data`), so the pre-read L1452-1457
   is unnecessary; decrement conditionally.
6. **`get_class_turn_in_stats` L2099-2243** — 5 sequential; wave 1 (class, assignments,
   projects with `project_members(user_id)` embed), wave 2 TSRs; skip the TSR query when no
   teams (L2202-2208 runs it anyway).
7. **`create_class` L285-290** — up to 5 sequential `ilike` probes for a free course code;
   generate 5 candidates, one `.in_()`.
8. **`get_classes_for_user` L411-420** — student path fetches instructor profiles to set
   `instructor_email`, **which the frontend never reads** (it reads `teacher_email`,
   `api.ts` L24, `ClassManagement.tsx` L333/L353). Either rename the key (decision D9:
   emit `teacher_email`) or drop the query.

Schema note (now staged in `2026-09-08_perf_indexes_and_lints.sql`): no index on
`project_members(project_id|user_id)`, `roster_entries(course_id|matched_profile_id)`,
`TSRs(assignment_id|project_id)`, `assignments(class_id)`; duplicate indexes on
`class_enrollments`; `idx_profiles_id` redundant.

## 3. Duplicated logic

- `service_client if service_client else supabase` — 20 copies (**done**: `get_client()`).
- Instructor-ownership check inline ×10: L440, L576, L963, L1198, L1318, L1387, L1511,
  L1589, L1701, L2112 → `core.authz.require_class_instructor(..., missing=404)`.
- Owner-or-enrolled block ×4: L706, L820, L1825, L1994 → `core.authz.require_class_access`.
- Display-name formatting ×4: `utils.profiles.profile_display_name` (used once, L141),
  `_key_role_name` L1930, inline `_name` closure L1887, `_resolve_roster_display_name` L89.
- Roster-row → student-dict projection ×2: L873-930 vs L1041-1083.
- Project-member → per-user affiliation map ×4: L743, L863, L1855, L2036 (L1896-1914 and
  L2054-2070 are identical owner/scrum-master card builders).
- `num_members` decrement: inline L1468 and `projects._increment_project_num_members`
  (both non-atomic read-modify-write).
- Enrollment check + conditional insert ×2: L608-620, L1627-1639.

## 4. Error handling / logging

- No `print()`, no raw error strings in `detail` except L190 (`Row {row_num}: {exc}` echoes
  CSV cell content at 400).
- **`@retry_on_disconnect` defeated**: `queue_invite` L1686 and `cancel_invite` L1743 catch
  `Exception` → 500 before the decorator sees transient httpx errors. Add
  `except TRANSIENT_ERRORS: raise` (pattern at L1919).
- `get_class_projects_overview` L2089 re-raises transient errors but is **not decorated**.
- `get_classes_for_user` lacks `except HTTPException: raise`.
- `_generate_tsr_assignments` L247-260 swallows all failures (class created, no TSRs, 200).
- `upload_class_roster`: post-insert steps L1273-1276 inside the same try → 500 after a
  successful upload → instructor re-uploads.
- Status inconsistency: same "class not found or no permission" condition → 403 at L2120,
  404 everywhere else; wording differs ("don't" vs "do not").

## 5. Dead / suspicious

- No unused functions/imports/TODOs.
- `instructor_email` produced, never consumed (see §2.8).
- `removed_from_teams` returned by `upload_class_roster` L1282, absent from
  `ApiRosterUploadResult`.
- `ApiStudent.user_id` (api.ts L40) is never emitted (backend emits `id`).
- `upload_class_roster` L1228 tests `remaining` against the accumulated `profile_map`
  (harmless because emails are deduped).

## 6. Response shapes (preserve)

- `get_classes` → `{"classes": [...]}`; instructor path = raw `select('*')` row +
  `enrolled_count`; student path = explicit columns (`id,name,description,created_by,
  created_at,course_code,status,term,start_date,year,image_url`) + `instructor_email` (→
  becomes `teacher_email` per D9) + `enrolled_count`.
- `get_class` → `{"class": <raw row>}`.
- `get_class_students` → `{"students": [{id,email,role,enrollment_role,first_name,
  last_name,project_id,project_name}]}`.
- `get_class_roster` → `{"students": [13 keys: id,name,email,first_name,last_name,
  roster_email,grepthink_email,project,class_status,grepthink_status,enrollment_role,
  projects,roster_entry_id], "uploaded_at"}` sorted by (name.lower(), email).
- `get_class_roster_timeline` → `{"students": [{id,name,email,class_status,enrolled_at,
  team_joined_at,project_name,dropped_at}]}`.
- `get_class_projects` → `{"projects": [{id,name,team_size,image_url,member_count,
  sentiment,product_owner_name,product_owner_email,scrum_master_name,
  scrum_master_email}]}` (`sentiment` None for non-instructors).
- `get_class_projects_overview` → `{"projects": [same 10 keys], "students": [same 8 keys
  as get_class_students]}`.
- `get_class_turn_in_stats` → `{"turn_in": {rate, teamsSubmitted{count,total},
  partialSubmissions{count,total}, currentAssignment, closeDate}}` (camelCase).
