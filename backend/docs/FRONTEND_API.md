# Frontend API reference

This document lists **HTTP endpoints** the React app can call, with **what each one does** and **who it is for**. The canonical route table lives in each feature’s `url.py`; this guide is optimized for product and frontend work.

**Also useful:** interactive OpenAPI at `/docs` and `/redoc` when the backend is running. Deeper backend behavior (RLS, helpers) is in [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md).

---

## Calling conventions

| Topic | Detail |
|--------|--------|
| **Base URL** | Dev: `http://localhost:5001` (or your `PORT`). With Vite, the SPA often proxies `/api` to this host. |
| **Auth** | Send `Authorization: Bearer <access_token>` on protected routes. Missing/invalid token → **401**. |
| **Role checks** | Many routes require **instructor** or a specific **project role**. Wrong role → **403**. |
| **JSON** | Use `Content-Type: application/json` for bodies unless noted. |
| **IDs** | Path and body UUIDs should be strings in JSON. |

**CORS:** Production must set `CORS_ORIGINS` to your SPA origin(s); wildcard `*` is rejected when credentials are used.

---

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Liveness check. Use this to verify the server is up **without** a token. |

---

## Auth (`/api/...`)

Prefix: **`/api`**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/test-auth` | Yes | Smoke test: confirms the token verifies and returns the authenticated `user_id`. |
| `GET` | `/api/login-check` | Yes | Returns `user_id` and **`role`** from the `profiles` table (`student` / `instructor`), or **`role: null`** if no profile exists yet. Used after OAuth to decide whether to send the user to role selection. |
| `POST` | `/api/create-user` | Yes | **INSERT-only** profile creation after signup. Body: `email`, `userId`, `userType` (`student` \| `instructor`). JWT `sub` must match `userId`. Returns **409** if a profile already exists (no role escalation via this route). |

---

## Classes (`/api/classes`)

All routes require auth unless stated otherwise.

| Method | Path | Who | Description |
|--------|------|-----|-------------|
| `POST` | `/api/classes` | **Instructor** | Create a course. Body: `name`, `description?`, `term`, `start_date` (date). |
| `GET` | `/api/classes` | Any logged-in user | List classes the user can see (depends on role and enrollment). |
| `GET` | `/api/classes/{class_id}` | Any logged-in user | Single class details. |
| `POST` | `/api/classes/join` | **Student** | Enroll using a course code. Body: `course_code`. Non-students get **403**. |
| `POST` | `/api/classes/{class_id}/invite` | **Instructor** | Invite a student by email. Body: `student_email`. |
| `GET` | `/api/classes/{class_id}/students` | Authenticated | Roster: enrolled students for the class. |
| `GET` | `/api/classes/{class_id}/projects` | Authenticated | Projects in this class, filtered by what the user is allowed to see. |

---

## Projects (`/api/projects`)

### Listing and detail

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/projects` | Create a project. Body: `class_id`, `name`, `description`, `team_size`, optional `looking_for_roles`, `skills`, and **instructor-only** sponsor fields. Enrolled students can create projects with stricter sponsor rules in the controller. |
| `GET` | `/api/projects` | List projects for the current user. **Query:** `class_id` (optional UUID) to filter. |
| `GET` | `/api/projects/pending-invites` | **Query:** `class_id` (required). Pending **team invitations** where the **current user** is the invitee (rows with `invited_by` set). Same shape as other join-request UIs where possible. **Register this path before `/{project_id}` in the router** (already done in `url.py`). |
| `GET` | `/api/projects/{project_id}` | Project details; may include `user_role` when applicable. |
| `PATCH` | `/api/projects/{project_id}` | Update fields (name, team size, description, sponsor fields). Allowed for **product owner**, **admin**, **owner**, or **class instructor** per controller rules. |
| `DELETE` | `/api/projects/{project_id}` | Delete project (elevated roles / instructor per controller). |

### Join requests and invitations

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/projects/request-join` | **Student** asks to join. Body: `project_id`. Creates a pending row with **`invited_by` null**. |
| `POST` | `/api/projects/accept-request` | Accept a pending `project_join_requests` row. Body includes `request_id` and **`user_id`** (required by the Pydantic model—typically the caller’s id; the server uses the JWT as the acting user). **Team invite** (`invited_by` set): only the **invitee** may accept. **Student request** (`invited_by` null): **class instructor** or project **owner** / **product owner** / **admin** may accept. |
| `POST` | `/api/projects/reject-request` | Same body shape as accept. Same permission split: invitee declines invites; instructors / owner / PO / admin reject student requests. |
| `GET` | `/api/projects/{project_id}/join-requests` | List pending **student-initiated** requests only (`invited_by` null). Callers: **class instructor** (even if not on the team) or project **owner** / **product owner** / **admin**. |

**Flows (summary):**

1. **Instructor** adds someone via `POST …/members` → member is added **immediately** (or role updated).
2. **Product owner / admin / owner** (not the class instructor) adds a **`member`** → creates a **team invite** (`invited_by`); invitee accepts/declines via accept/reject.
3. **Student** uses **request-join** → instructor or owner/PO/admin reviews via **join-requests** + accept/reject.

### Members and roles

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/{project_id}/members` | Members with emails and project roles. |
| `POST` | `/api/projects/{project_id}/members` | Add or update membership. **Instructor:** immediate add/update. **Owner / PO / admin** (not instructor): adding **`member`** creates a **pending invite**; other roles follow controller rules. Body: `user_id`, `role` (default `member`). |
| `DELETE` | `/api/projects/{project_id}/members/{user_id}` | Remove a member (**instructor** flow in views). |
| `POST` | `/api/projects/{project_id}/assign-product-owner` | Body: `user_id`. Assign **product owner** (demotes previous PO on that project to `member` in controller). |
| `POST` | `/api/projects/{project_id}/assign-scrum-master` | Body: `user_id`. Assign **scrum master**. |
| `POST` | `/api/projects/{project_id}/assign-admin` | Body: `user_id`. Assign **admin**. |
| `POST` | `/api/projects/{project_id}/remove-scrum-master` | Body: `user_id`. Demote scrum master to `member`. |
| `POST` | `/api/projects/{project_id}/remove-admin` | Body: `user_id`. Demote admin to `member`. |

### Test-only (avoid in production UI)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/projects/test-create` | Same body as normal create. **Bypasses normal role checks**—any authenticated user could create a project in a class that exists. Intended for legacy demo pages; **do not use** in real product flows. |

---

## Assignments (`/api/assignments`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/assignments` | Create assignment. Body: `class_id`, `title`, `open_date`, `close_date`, `status` (`draft` \| `publish`), optional `assignment_type`. Instructor-only in controller. |
| `GET` | `/api/assignments` | **Query:** `class_id` (**required**). List assignments for that class. |
| `PATCH` | `/api/assignments/{assignment_id}` | Partial update: `title`, dates, `status`, `assignment_type` (all optional in body). |
| `GET` | `/api/assignments/{assignment_id}/tsrs` | **Student:** TSR entries **you** submitted for this assignment. |
| `GET` | `/api/assignments/{assignment_id}/tsrs/about/{evaluatee_id}` | **Instructor:** all TSR rows about a given student for this assignment. |
| `PATCH` | `/api/assignments/{assignment_id}/tsrs/{tsr_id}` | Update editable TSR fields (`percent_contribution`, feedback fields, `scrum_master_notes`). |

---

## TSRs (`/api/tsrs`)

Team self-reviews tied to a **project** (and optionally an **assignment**).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/tsrs` | Submit a TSR. Body: `evaluatee_id`, `project_id`, `week`, `percent_contribution`, `positive_feedback`, `constructive_feedback`, optional `scrum_master_notes`, optional `assignment_id`. Evaluator is always the authenticated user. |
| `GET` | `/api/tsrs/{project_id}` | TSRs for the project; visibility rules in controller (e.g. scrum master / admin may see more). |
| `GET` | `/api/tsrs/{project_id}/submitted` | TSRs **submitted by** someone. **Query:** `user_id` (optional; admins/scrum masters may target another user), `week` (optional). |
| `GET` | `/api/tsrs/{project_id}/received` | TSRs **received by** someone (about them). **Query:** `user_id` (optional), `week` (optional). |

---

## Staffing (`/api/staffing`)

The staffing module backs the **Interest Form** (student) and the **Project Staffing / Assign Projects** (instructor) flows. It owns three tables — `interest_form` (per-(user, class, project) ranks), `interest_submissions` (per-(user, class) general background fields), and `interest_team_preferences` (per-(user, class) "want / don't want to work with" lists). Project assignments themselves continue to live in `project_members`; staffing routes mutate them indirectly through the projects controller so `num_members` stays correct.

### Student-facing — interest form

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/staffing/interest` | Upsert a single ranked preference. Body: `class_id`, `project_id`, `interest_value` (1–5), optional `interest_reason`. Used for partial / draft saves. **400** if `interest_value` is out of range or the project does not belong to the class. |
| `POST` | `/api/staffing/{class_id}/submission` | Submit the **entire** interest form atomically. Body: `taking_115c?` (bool), `previous_project_name?`, `previous_project_link?`, `notes?`, `ranked_projects` (list of `{project_id, interest_value, interest_reason?}`), `work_with` (list of user ids), `dont_work_with` (list of user ids), `submitted` (bool — set `false` for draft). Replaces the user's `interest_form` and `interest_team_preferences` rows for the class and upserts `interest_submissions`. |
| `GET` | `/api/staffing/{class_id}/my-interests` | Current user's ranked-project rows for the class, hydrated with `project_name` and sorted highest-interest first. |
| `GET` | `/api/staffing/{class_id}/my-submission` | Current user's full interest-form payload — general fields + `ranked_projects` + `work_with` + `dont_work_with` (each peer hydrated with name/email). Always returns a `submission` object; `submitted_at` is `null` when the user has never submitted. |

### Instructor analytics

All routes require the caller to be the class instructor; non-instructors receive **404** to avoid leaking class existence.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/staffing/{class_id}/pref-by-student` | Every enrolled student grouped with their preferences (highest first), sorted alphabetically. Mirrors the spreadsheet's "pref by student" sheet. |
| `GET` | `/api/staffing/{class_id}/pref-by-project` | Every project paired with the students that ranked it (highest first), sorted alphabetically. Mirrors "pref by project". |
| `GET` | `/api/staffing/{class_id}/project-rank` | Per-project breadth/depth/strength + breadth/depth/strength ranks, `sum_of_ranks`, and `total_rank` (1 = most desirable). Also returns `num_staff`, `team_size`, and `availability = team_size - num_staff`. Mirrors the "project rank" sheet. |
| `GET` | `/api/staffing/{class_id}/project-availability` | One row per (interested student, project) with `interest_value`, the student's current assignment, and project remaining seats. Mirrors the "PA" sheet. |
| `GET` | `/api/staffing/{class_id}/assignments` | All-students AU-style grid: `user_id`, `user_name`, `assigned_project_id` (nullable), `assigned_project_name`, `role`. |
| `GET` | `/api/staffing/{class_id}/students` | Full per-student payload for the Assign UI: profile fields, `submitted_at`, `taking_115c`, `previous_project_*`, `notes`, `preferences[]`, `work_with[]`, `dont_work_with[]`, and `assigned_project`. Lets the frontend render the Students panel without N+1 calls. |

### Instructor actions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/staffing/{class_id}/assign` | Assign a student to a project. Body: `user_id`, `project_id`. Removes them from any other project in this class first; if the new add fails, removed projects are restored. **400** if the project is in another class. |
| `POST` | `/api/staffing/{class_id}/unassign` | Remove the student from whichever project they are on in the class. Body: `user_id`. **404** if the student is not currently assigned. |
| `POST` | `/api/staffing/{class_id}/auto-assign` | Run greedy least-options-first auto-assignment for every unassigned student. Returns `{"placements": [{user_id, project_id, project_name, interest_value}, ...]}`; an empty list means everyone is already placed. |

---

## Messages (`/api/messages`)

Direct peer-to-peer messaging between enrolled users. A **conversation** is a canonical (user_a, user_b) pair; messages nest inside a conversation. Instructors can message any student they share a class with; students can message other students and instructors in shared classes. Instructor-to-instructor messaging is not permitted.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/messages/conversations` | Yes | Inbox: all conversations the current user participates in, sorted by `last_message_at` desc. Each row includes `other_user` (id, name, email), `last_message` preview, `unread_count`, `other_user_last_read_at`, `can_send`, and `last_message_at`. Conversations with no messages are omitted. |
| `POST` | `/api/messages` | Yes | Send a message. Body: `to_user_id` (string), `body` (string, max 1 024 chars). Returns `{"conversation_id": "...", "message": {...}}`. **403** if the two users are not eligible to message each other (no shared class, or instructor↔instructor). |
| `GET` | `/api/messages/conversations/{conversation_id}/messages` | Yes | Latest 50 messages in the conversation (newest first). **403** if the caller is not a participant; **404** if the conversation doesn't exist. |
| `POST` | `/api/messages/conversations/{conversation_id}/read` | Yes | Mark the conversation as read up to now (upserts the caller's `last_read_at` row). Returns **204 No Content**. |

---

## Status codes to expect

| Code | Typical meaning |
|------|------------------|
| **401** | Missing or invalid JWT. |
| **403** | Authenticated but not allowed (wrong role, not a member, wrong reviewer for a join row, etc.). |
| **404** | Resource not found (class, project, request id, …). |
| **409** | Conflict (e.g. profile already exists on `create-user`, duplicate pending join). |
| **422** | Validation error (bad body/query); FastAPI/Pydantic detail in response. |
| **500** | Server or database error. |

---

## Maintenance

When you add or change a route in `app/*/url.py`, update this file in the same change so frontend and API stay aligned.
