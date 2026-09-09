# Audit — `backend/app/projects/` and `backend/app/staffing/` (2026-09-08)

> Line numbers refer to commit `613e4d1` (pre-format). "Effective" counts include helpers.
> Client-idiom replacement and the `print()`/`str(e)` leaks noted below are partly done:
> the idiom is gone (`get_client()`); the six leaking handlers are still to fix (7b).

## 1. Function map (hot rows only)

| Function | Lines | execute() (effective) | loops | authz |
|---|---|---|---|---|
| projects.create_project | 113-272 | 4 (6-8) | no | get_user_role + inline class checks |
| projects.get_projects_for_user | 428-515 | 6 (5 class path) | no | inline created_by + enrollment |
| projects.get_project_by_id | 518-557 | 2 | no | **none** |
| projects.get_project_members | 1480-1540 | 3 | no | **none** |
| projects._leave_current_project_in_class | 699-760 | 3 (+5-6 per membership) | YES L738-760 | caller |
| projects._notify_product_owners_of_departure | 588-653 | 2 (+1 per PO) | YES L635-653 | none |
| projects.request_to_join_project | 763-880 | 4 (6-14) | no | none (any user) |
| projects.accept_join_request | 883-989 | 4 (13-17) | no | _assert_can_review… |
| projects.assign_product_owner / assign_scrum_master | 1317-1378 | 4 (7+N) | YES (per current holder) | _require_project_role_manager |
| projects.get_pending_team_invites_for_user | 1543-1616 | 5 sequential | no | inline |
| projects.get_my_pending_join_requests_for_user | 1619-1707 | 4 sequential | no | inline |
| projects.instructor_add_member | 1761-1921 | 8 | no | _is_instructor + inline role check |
| projects.instructor_remove_member | 1923-1988 | 3 (6) | no | same |
| staffing.submit_form | 344-498 | 8 (17-22) | YES L373-382 (`_project_in_class` per ranked project) | _require_class_member |
| staffing.get_class_students_with_interest | 936-1070 | 2 (10, partly parallel) | no | _require_class_instructor |
| staffing.assign_user | 1075-1174 | 0 (~18) | YES + rollback loops | _require_class_instructor |
| staffing.unassign_user | 1177-1217 | 0 (~9) | YES | same |
| staffing.auto_assign | 1220-1319 | 0 (6 + ~8 per placement) | YES L1284-1313 | same |

Views are thin pass-throughs (0 queries).

## 2. N+1 and waterfall hotspots (ranked)

1. **`staffing.auto_assign` L1220-1319** — per placement calls
   `projects.instructor_add_member` (8 round trips each: project read, `_is_instructor`,
   membership check, insert, scrum-master check+update, num_members read+update). 60
   placements ≈ **486 sequential calls**, not idempotent, will time out. Rewrite: decide
   placements in memory, one bulk `project_members` insert, one recount read + per-project
   `num_members` update, scrum-master auto-pick in the same pass (~8 calls). *(No UI calls
   this endpoint today — `api.staffingAutoAssign` exists but is unused.)*
2. **`staffing.assign_user` / `unassign_user`** — ~18 calls per drag-and-drop:
   `_get_projects_user_is_in` L211-218 never receives the projects it could reuse (double
   fetch), then `instructor_remove_member` (6) + `instructor_add_member` (8). Rewrite: one
   membership read for the student across class projects, one delete, one insert, recount.
   Rollback L1128-1133/L1151-1156 re-adds with hardcoded `role="member"` (loses PO/SM).
3. **`staffing.submit_form` L373-382** — `_project_in_class` per ranked project (≤5) +
   trailing `get_my_submission` re-read (5) ≈ 20 calls. Validate with one `.in_()`; return
   the locally built payload.
4. **`projects._leave_current_project_in_class` + `_notify_product_owners_of_departure`**
   — nested loops on the join/accept hot path: bulk delete (`.in_('project_id')`), one PO
   read, one bulk notification insert; move the notifier into
   `notifications.controller` (it duplicates `notify_join_request`'s query).
5. **`projects.instructor_add_member` L1761-1921** — 8 → 3: embed
   `projects.select('id, class_id, classes(created_by)')`, one `project_members` read with
   `.in_('user_id', [requester, target])`; bookkeeping (scrum master + num_members) folded.
   Fixing this multiplies through #1 and #2.
6. **`projects.accept_join_request`** — 13-17: request→project→class embed + one members
   read, then writes (~5). Non-atomic status update / member insert / counter (flagged in
   code at L921).
7. **`projects.get_projects_for_user` L428-515** — 5 sequential → 2: `require_class_access`
   + `projects.select('id, name, team_size, image_url, project_members(user_id, role)')`.
   The no-class branch L463-465 already uses an embed (proves embeds work here).
8. **`staffing.get_class_students_with_interest`** — 3 waves → 2 (`project_members` via
   `projects!inner(class_id)` filter; reuse the loaded projects for `_project_lookup`).
9. **`projects.assign_product_owner` etc. L1317-1477** — 7+N → 4: one project embed, one
   members read, one `update ... eq(role).neq(user_id, target)` instead of a loop.
10. **`get_pending_team_invites_for_user` / `get_my_pending_join_requests_for_user` /
    `get_project_pending_invites`** — embeds with FK hints:
    `projects!inner(id, name, class_id)`,
    `profiles!project_join_requests_invited_by_fkey(email, role)`.
11. **`get_project_members` / `get_project_by_id`** — one embedded read each
    (`project_members(user_id, role, created_at, profiles(...))`).

Caveat: `tests/fake_supabase.py` now supports embeds, but each embed must be declared in
`relations=`; `.limit()` is supported.

## 3. Duplicated logic

- Client idiom ×21 (**done**).
- Instructor check ×5 variants: `projects._is_instructor` L92 (**returns None on error**),
  inline L316-321, inline created_by+enrollment L446/L1558/L1638, `staffing._require_class_instructor`
  L53 (404), `create_project` L178 (cached role). → `core.authz`.
- Owner-or-enrolled block ×3 verbatim (L441, L1553, L1628) + `staffing._require_class_member`
  L77 (400). → `core.authz.require_class_access` (keep each call site's status).
- Member/elevated-role check ×6 (L33, L574, L1273, L1307, L1801, L1958); the role tuple is
  written five different ways. → `core.authz.require_project_role(..., ELEVATED_PROJECT_ROLES)`.
- `num_members`: written by `_increment_project_num_members` (non-atomic); two readers count
  rows instead (`get_projects_for_user` L478, `staffing.project_rank` L744), two trust the
  column (L1695, `staffing.pref_by_project` L696).
- Profile hydration ×4 in projects (L1511, L1216, L1593, L1733) vs `staffing._name_lookup`.
- `staffing` lazily imports `app.projects.controller` (L1100, L1198, L1281) citing a cycle
  **that does not exist** — hoist to module scope. `attendance` imports the private
  `projects._is_instructor`; `classes` imports `_increment_project_num_members`.

## 4. Error handling

- **`print()` ×6 + `detail=f"...{str(e)}"` ×6** in `assign_product_owner`,
  `assign_scrum_master`, `assign_admin`, `remove_product_owner`, `remove_scrum_master`,
  `remove_admin` (L1344-1477) — leaks PostgREST error text to the browser. Fix first.
- `_is_instructor` returns `None` on DB error → 8 authorization decisions turn a blip into
  403 (L403, L415, L572, L1181, L1271, L1294, L1799, L1955).
- `instructor_remove_member` L1952 returns `False` (200 with body `false`) when the
  project is missing.
- `@retry_on_disconnect` on only 2 of 38 functions; `_TRANSIENT_HTTPX_ERRORS` duplicated
  at L63-68.
- Status-code split for the same denial: 403 (projects) vs 404/400 (staffing).

## 5. Dead / suspicious

- Routed but unconsumed: `POST /api/staffing/interest` (`submit_interest`),
  `pref-by-student`, `pref-by-project`, `project-availability`; `my-interests` and
  `auto-assign` have `api.ts` helpers but no component calls. **Decision D5: keep.**
- `conftest.mem` fixture imported a missing module (**removed**). No staffing tests exist.
- `projects/views.py`: unused `logging`/`HTTPException` imports (removed by ruff).
- Data-integrity: unconditional `num_members` decrement L1966-1971 (drift);
  non-atomic accept L921-972; `instructor_add_member` does not enforce
  one-project-per-class; `submit_form` delete-then-insert without transaction;
  `_delete_project_dependencies` omits `interest_team_preferences` / `project_review_tas`;
  `delete_project` calls `_is_instructor` twice (L403, L415).

## 6. Response shapes (preserve)

- `get_projects_for_user` → `{"projects": [{id,name,team_size,image_url,member_count,
  user_role}]}` (`member_count` from live rows; no-class branch has `team_size`/`image_url`
  null).
- `get_project_by_id` → `{"project": <select('*') row> + user_role}`.
- `get_project_members` → `{"members": [{user_id,email,user_role,project_role,joined_at,
  first_name,last_name,linkedin,github,image_url,edu_email}]}`.
- `get_pending_join_requests` → `{"requests": [{request_id,user_id,email,user_role,
  requested_at,status,message}]}` (student-initiated only).
- `get_pending_team_invites_for_user` → same six keys (email/user_role = **inviter**) +
  `project_id`, `project_name`.
- `get_my_pending_join_requests_for_user` → `{"requests": [{request_id,user_id,
  requested_at,status,project_id,project_name,member_count,sponsor_company,course_label,
  image_url}]}` (`member_count` from the column; status pending|rejected).
- `get_project_pending_invites` → `{"invites": [{request_id,user_id,email,invited_at}]}`.
- staffing `get_assignments` → `{"assignments": [{user_id,user_name,user_email,
  assigned_project_id,assigned_project_name,role}]}`; `get_class_students_with_interest`
  → 13-key rows with `preferences[]`, `work_with[]`, `dont_work_with[]`,
  `assigned_project|null`; `project_rank` → 13-key rows; `get_my_submission` →
  `{"submission": {...}}` always a dict; `assign_user` → two shapes (early return
  `message,user_id,project_id`; normal adds `previous_project_ids[]`, `added`);
  `auto_assign` → `{"placements": [{user_id,project_id,project_name,interest_value}]}`.
