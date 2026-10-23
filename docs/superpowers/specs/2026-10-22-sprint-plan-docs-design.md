# Sprint Plan Documents — Design Spec

**Date:** 2026-10-22
**Base:** `origin/beta` at `50f65d16` (code references below are to that head). New work branches from it.
**Status:** draft for the maintainer's approval. Decisions marked ⚑ are mine; the others are the
maintainer's (2026-10-21/22, two rounds). Nothing is built.

## The ask

Every sprint, each team writes a Google Doc from the CSE 115 "Sprint Plan Template" and shares it with
its TA. Build that document into GrepThink:

- a **draft state**, and team collaboration as **saved iterations with a simple diff** (no live editor,
  no conflict machinery);
- an **AI refine** that turns a one- or two-line idea into a structured user story with tasks, using a
  simple Workers AI model, shown as a **slug** that crawls over the old text and leaves the model's
  output behind;
- a **bridge** that exports the plan to stories and tasks on the scrum board, **scrum master only**.

Objective: speed. Students should not be lost in documentation.

Two things the board needs first (the maintainer, round 2): **sprints come from the class**, not from a
"New sprint" button: a class carries how many sprints it has and how often they run, within its last day,
and every team gets those sprints created for it, empty. And the **burnup draws in hours or points**,
warning when it had to use hours and nudging the team to add points; the plan itself always needs hours.

## The template (CSE 115, last modified 2023-06-25)

| Section | What the template asks for | Where it comes from here |
| --- | --- | --- |
| Heading | "Sprint N Plan", product name, team name, sprint completion date, revision number and date | sprint, project and the saved revisions: automatic |
| Goal | one or two sentences | typed |
| Task listing by user story | stories in priority order; tasks with a time estimate, preferably ≤ 6 ideal hours; a total per story | typed, or pre-filled from the board; totals computed; hours required |
| Team roles | every member with at least one role for this sprint | typed; carried forward from the previous plan |
| Initial task assignment | each member's first story and task | derived from the tasks' assignees |
| Initial burnup chart | a labelled chart | the board's burnup for the sprint, embedded, in hours until the team adds points |
| Initial scrum board | a physical four-column board | the board itself, once exported |
| Scrum times | at least three weekly meeting times, and which one the TA visits | the team's TA slots from attendance, plus typed rows; carried forward |
| Updated release plan | only when it changed | a later document kind (out of scope) |

## Goals, non-goals, anti-goals

**Goals.** A plan takes minutes, not an evening: the heading, totals, assignment table, burnup and board
are derived; a new plan is seeded from the board and the previous plan; mistakes the TA would flag a
week later show up at once. One source of truth: before export the plan, after export the board. The TA
finds every plan in one place and reads the revision that was finalized. Nobody creates a sprint by hand.

**Non-goals.** Live multi-cursor editing. A general document editor. A release plan or sprint report
(the maintainer will send those templates; the tables are named so they fit). PDF export. Comments on
the plan. Streaming model output. Changing who holds project roles. Per-team sprint schedules.

**Anti-goals.** A second backlog that drifts from the board. A model that writes to the board on its
own. Student text in anyone's logs. A plan that is slower than the Google Doc it replaces.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | **Structured document**, not free text. Sections are typed fields; Markdown only inside a story's description. | Diffs are clean, totals and tables derive, the slug has a field to replace. (maintainer) |
| D2 | **Link on export; ad-hoc board items join only on re-import.** Export writes the created ids into the plan. A story or task created on the board afterwards is not in the plan until someone runs "Re-import from board", which adds it as a linked item. | The maintainer's rule. Before export the plan is the source; after export the board is. |
| D3 | **Linked items are a snapshot with a live overlay.** A linked item keeps its own title, description, hours, assignee and tags in the body (as copied at export or import) and is read-only in the editor; the editor overlays the board's current status and marks an item whose board title, hours or assignee now differ ("changed on the board"). Re-import refreshes the copies. Editing happens on the board, with a link to it. ⚑ | The template is graded on the *initial* plan, so the finalized revision must read the same later; two editable copies of one task would need the conflict machinery the maintainer declined. |
| D4 | **Last writer wins.** A save makes revision head+1 unconditionally. The response says when it replaced a revision the saver never saw (the client sent `base_revision`), and the client offers the diff. ⚑ (the notice) | The maintainer chose last writer wins; the notice costs one comparison in the save function and makes a lost edit recoverable from the stored revision. |
| D5 | **Revisions are kept during the sprint and pruned after it ends**: a nightly job deletes all but the head and the finalized revision of every plan whose sprint ended seven or more days ago. ⚑ (the job and the grace week) | The maintainer's storage rule. Sprint status is derived from dates (D22), so there is no "completed" write to hook; pg_cron already runs the analytics rollup on PROD. |
| D6 | **Draft → Final, by the project's scrum master; roles in the plan are per sprint and change nothing on the project.** Finalizing stamps `finalized_revision`; later saves keep the plan final and bump the revision. When the project has no scrum master (a one-person team), an owner, product owner or admin may finalize. The checker warns when the plan names a Scrum Master who is not the project's. ⚑ | `project_members.role` holds one value per member, the Team tab forbids the product owner as scrum master, and the TSR's Scrum Master tab reads the live role: moving the role from a plan would strip the product owner or hand an open TSR to someone else. The Team tab stays the place to change it. |
| D7 | **Export: the project's scrum master only (the D6 fallback applies), and only the finalized revision.** "Finalize & export" finalizes the head first when it is newer than the finalized revision, then exports; a re-export creates only unlinked items. ⚑ | The maintainer's rule; exporting the finalized revision means the plan the TA reads is the plan on the board. |
| D8 | **Re-import: any member.** It changes only the plan, which any member can edit. ⚑ | |
| D9 | **Hours are required in the plan; the 6-hour guideline warns; the board's 1–15 h cap stays.** A plan cannot be finalized or exported while a task has no hours. | maintainer: "the sprint plan template itself must mandatorily need hours"; warn at 6 |
| D10 | **AI = refine only**, two kinds: refine one line into a story with tasks; split a story into tasks. Default model `@cf/ibm-granite/granite-4.0-h-micro`, fallback `@cf/zai-org/glm-4.7-flash` with thinking off; `AI_MODEL_REFINE` overrides. Same daily quota as the board's drafts (`ai_draft_usage`, 10/day), rate limit 5/min **per user**, timeout 25 s. ⚑ (model, quota, timeout) | "A simple model." Granite is the cheapest instruct model in the catalog with JSON mode; the quality check in the plan decides between the two. |
| D11 | **One shared LLM client** (`app/core/llm.py`) replaces the HTTP code in `app/scrum/ai_draft.py`; it knows a platform provider (env) and a per-user **BYOK** provider (Cloudflare account token, or any OpenAI-compatible endpoint with an API key). Keys are Fernet-encrypted at rest; a BYOK call bypasses the platform quota, not the rate limit. | maintainer: multiple Cloudflare models + BYOK |
| D12 | **Personal subscriptions are not a key.** Anthropic's consumer terms forbid Pro/Max OAuth tokens in other products; OpenAI's "Sign in with ChatGPT" plan sharing is documented only for open-source, locally hosted apps and is partner-gated for hosted ones. BYOK takes API keys. | research 2026-10-22 (sources at the end) |
| D13 | **Finalize notifies the TA**: in-app notification plus an outbox email to the meeting TA and the review TAs, not the instructor; once per finalized revision. ⚑ (recipients) | maintainer: notify through the outbox; comments later |
| D14 | **Lives on the board**, per sprint: a "Sprint plan" button beside the sprint picker, a link on the project page's sprint card, and a status chip per team on the TA schedule view. | maintainer |
| D15 | **Markdown export**, server-rendered in the template's order from the finalized revision (the head while a draft), downloadable and copyable. No PDF. | maintainer |
| D16 | **Scrum times: the team's weekly TA slots plus typed rows.** The slots are the `meetings` rows attendance keeps (`cadence = 'weekly'`, one per sequence), shown read-only and counted as the meetings the TA visits; the plan body holds the team's other times with a `ta_visit` flag for a team that has no slot yet. Carried forward sprint to sprint. ⚑ | The merged team-meetings module holds one-off meetings; the weekly rows are the TA's slots, read by attendance with `cadence = 'weekly'`. A new weekly kind would leak into those reads; calendar rows for scrum times are a follow-up. |
| D17 | **Tables are named by document kind** (`project_documents.kind`), with `sprint_plan` the only kind now. | release plan and sprint report later |
| D18 | **No streaming.** The slug idles over the field while the request runs and sweeps once the whole response is in. ⚑ | The Vercel Python runtime has no safe streaming path; a sweep after the fact reads the same. |
| D19 | **Link fields are server-owned.** A save copies `story_id` / `task_id` and the linked item's snapshot fields per item from the head revision; values in the request are ignored for linked items. ⚑ | A client must not be able to point a plan item at an arbitrary board row, or edit a linked item around the board. |
| D20 | **Sprints come from the class.** A class carries `sprint_count` (1–20), `sprint_frequency` (weekly, biweekly, monthly) and `sprints_start_on`; creating a class requires the first two, and the schedule must end by the class's last day. Every team gets "Sprint 1 … N" created when the team is created, empty; an instructor who sets or changes the schedule later regenerates them for every team. No "New sprint" control anywhere in the web client. | maintainer, round 2 |
| D21 | **The burnup draws in points or hours, and counts tasks on both lines.** Scope is the sum of the sprint's task estimates in the unit, completed the same sum over done tasks. Points are available only when every task in the sprint has points; hours are the fallback and may be partial. Points when available, else hours; with both, the chart offers a toggle. In hours it says so and nudges: "Add points to tasks for a points burnup", and the board shows tasks without points with a faint dashed points chip. ⚑ (task-based scope, the completeness rule, the toggle) | maintainer, round 2. Today scope is story points and completed is task points (`_totals`), so a sprint whose tasks carry points but whose stories don't draws completed above scope; counting tasks on both lines removes that. PROD has no sprint data yet (no screen has ever created a sprint), so the snapshot columns can change meaning. |
| D22 | **Sprint status is derived from dates**: `completed` after `ends_at`, `active` from `starts_at` through `ends_at`, else `planned`; the stored column is no longer read and the update route stops accepting a status. The board opens on today's sprint. ⚑ | Auto-created sprints have nobody to flip them; the pills and the "latest active" default would lie. |

## Part 0 — Board groundwork (PR 0)

### Class sprint schedule (D20)

Migration `backend/database/migrations/2026-10/2026-10-22_class_sprint_schedule.sql` (expand, idempotent):

```sql
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS sprint_count     smallint;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS sprint_frequency text;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS sprints_start_on date;
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_sprint_schedule_valid;
ALTER TABLE public.classes ADD CONSTRAINT classes_sprint_schedule_valid CHECK (
  (sprint_count IS NULL AND sprint_frequency IS NULL AND sprints_start_on IS NULL)
  OR (sprint_count IS NOT NULL AND sprint_frequency IS NOT NULL
      AND sprint_count BETWEEN 1 AND 20
      AND sprint_frequency IN ('weekly', 'biweekly', 'monthly')
      AND sprints_start_on IS NOT NULL)
);
ALTER TABLE public.sprints ADD COLUMN IF NOT EXISTS sequence smallint;
ALTER TABLE public.sprints DROP CONSTRAINT IF EXISTS sprints_sequence_check;
ALTER TABLE public.sprints ADD CONSTRAINT sprints_sequence_check CHECK (sequence IS NULL OR sequence >= 1);
CREATE UNIQUE INDEX IF NOT EXISTS sprints_project_sequence_uq ON public.sprints (project_id, sequence)
  WHERE sequence IS NOT NULL;
```

Existing classes keep NULLs (no schedule) until their instructor sets one; a sprint created through
the API before this change has `sequence NULL` and is left alone. The date arithmetic
(`app/scrum/schedule.py`, pure): sprint *k* starts on `sprints_start_on + (k−1)·7 days` (weekly),
`+ (k−1)·14 days` (biweekly), or the same day of the month *k−1* months later, clamped to the month's
last day (monthly); it ends the day before the next one starts; the name is `Sprint k`. The schedule is
valid when `sprints_start_on` is on or after the class's `start_date` (when set) and the last sprint ends
on or before `end_date` (when set); otherwise 422 `SPRINTS_PAST_END` with the last day in the detail.

- `POST /api/classes` (`CreateClassRequest`): `sprint_count` and `sprint_frequency` required;
  `sprints_start_on` optional, defaulting to `start_date`. The web form (`Classes/CreateClassModal.tsx`)
  requires all three and the last day of classes, and shows the computed last sprint end as the user
  types ("Sprint 5 ends Dec 1").
- `PATCH /api/classes/{class_id}/sprints` (instructor; `{sprint_count, sprint_frequency,
  sprints_start_on}`): validates, writes the class, then regenerates every team's sprints (below).
  `ClassSettingsModal.tsx` gets a "Sprints" section beside the last day of classes, with "Set up
  sprints" for a class that has none.
- `PATCH /api/classes/{class_id}/end-date` (`classes/controller.py:872`) also refuses a day before the
  last sprint's end, as it already refuses a day that would hide attendance weeks: 409
  `END_DATE_BEFORE_SPRINTS` naming that sprint and its end. The Sprints section shows "Sprint 5 ends
  Dec 1" beside the last-day field, so the instructor shortens the schedule first. ⚑
- `scrum.controller.ensure_project_sprints(client, project_id, schedule)`: for sequences 1..N, insert
  the missing ones in one bulk insert, and update the name and dates of existing sequenced ones that
  differ (one update per changed row; a schedule change is rare). Sequences beyond N are deleted only
  when they hold no stories and no plan beyond an untouched seed (a plan whose head is revision 1 of
  source `seed`, never finalized, goes with its sprint); otherwise 409 `SPRINTS_IN_USE` naming the team
  and the sprint, and nothing is written. PR 0 checks stories; PR A adds the plan rule when the table
  arrives. Called from `projects.controller.create_project` right after the `projects` insert
  (`controller.py:233`, the only insertion point) when the class has a schedule, and by the PATCH for
  every project of the class (`fan_out` over teams, budget ≤ 3 round trips per team).
- `POST /api/projects/{id}/scrum/sprints` (`create_sprint`) stays for API callers; the web client no
  longer offers it and the catalog entry says so. Removing it is a follow-up decision.
- Copy: the empty board reads "This class has no sprint schedule yet. Your instructor sets it in Class
  Settings." (members) / "Set the sprint schedule in Class Settings to create this team's sprints."
  (instructor).

### Derived sprint status (D22)

`scrum.schedule.sprint_status(starts_at, ends_at, today)` is applied wherever a sprint row becomes a
`SprintOut` (`get_board`, `get_summary`, `create_sprint`, `update_sprint`), with `_today_la()` as
today. `_select_sprint` without a `sprint_id` picks the sprint whose dates contain today, else the
latest one that has started, else the first. `UpdateSprintRequest` loses `status`; the catalog's
`update_sprint` params follow. The `sprints.status` column stays (a contract migration can drop it
later); `utils/sprints.ts` and `SprintStatusPill` are unchanged, they already read the API's status.

### Burnup in hours or points (D21)

Migration `2026-10-22_burnup_hours.sql`: `sprint_burnup_days` gains `scope_hours integer NOT NULL
DEFAULT 0` and `completed_hours integer NOT NULL DEFAULT 0`. Snapshot rows from before the migration
have zeros for hours; `build_sprint_series` treats a snapshot whose unit values are both zero while the
other unit's are not as "no snapshot for this unit" and carries forward.

- `_totals` returns `{scope_points, completed_points, scope_hours, completed_hours, tasks_total,
  tasks_with_points}`: scope = the sum over the sprint's tasks of `points` (or `estimate_hours`),
  completed = the same sum over done tasks; story points no longer feed the burnup. `_live_burnup_totals`,
  `_snapshot_burnup_safe` and the `final` snapshot of the cumulative series carry both units;
  `_sprint_progress` (the sprint picker's "12/20 pts") reports the chosen unit.
- `burnup.build_sprint_series(..., unit)` reads `scope_<unit>` / `completed_<unit>`;
  `_completed_by_day_from_moves(client, task_values, ...)` takes the task → value map in the chosen
  unit.
- `BoardResponse.burnup` becomes `{unit: 'points' | 'hours', units_available: [...], sprint, cumulative,
  tasks_without_points: int}`. `units_available` holds `points` when the sprint has at least one task
  and every task has points, and always holds `hours` (a task without hours counts zero). The default
  is points when available, else hours; `GET …/scrum/board?unit=hours|points` picks one that is
  available (422 otherwise).
- Web: `BurnupChart` takes `unit` for its axis label ("hours" / "points") and a `SegmentedControl`
  toggle when `units_available` has both; in hours the card shows "Burnup in hours · add points to
  tasks for a points burnup (7 tasks without points)". `TaskCard` shows a faint dashed "– pts" chip
  on a task without points (the design tokens' muted border, no fill), and the task editor's points
  field hint reads "Used by the burnup".

## Part 1 — Data model (documents)

Migration `backend/database/migrations/2026-10/2026-10-22_project_documents.sql` (expand, idempotent, one
transaction; apply on DEV before testing, on PROD before the release merge). Browser roles get nothing,
as the 2026-09-21 lockdown requires.

```sql
CREATE TABLE IF NOT EXISTS project_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind               text NOT NULL,
  sprint_id          uuid REFERENCES sprints(id) ON DELETE CASCADE,       -- required for sprint_plan
  status             text NOT NULL DEFAULT 'draft',
  head_revision      integer NOT NULL DEFAULT 0,
  finalized_revision integer,
  finalized_at       timestamptz,
  finalized_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  exported_at        timestamptz,
  exported_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_documents_kind_valid   CHECK (kind IN ('sprint_plan')),
  CONSTRAINT project_documents_status_valid CHECK (status IN ('draft', 'final')),
  CONSTRAINT project_documents_sprint_shape CHECK (kind <> 'sprint_plan' OR sprint_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_documents_sprint_kind_uq ON project_documents (sprint_id, kind)
  WHERE sprint_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS project_documents_project_idx ON project_documents (project_id, kind);

CREATE TABLE IF NOT EXISTS project_document_revisions (
  document_id uuid NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  number      integer NOT NULL CHECK (number >= 1),
  body        jsonb NOT NULL,
  source      text NOT NULL DEFAULT 'edit',
  saved_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  saved_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, number),
  CONSTRAINT project_document_revisions_source_valid CHECK (source IN ('seed', 'edit', 'import', 'export')),
  CONSTRAINT project_document_revisions_body_size CHECK (pg_column_size(body) <= 262144)
);

-- One save: next number, head bump, last-writer-wins notice. The row lock serialises two saves.
CREATE OR REPLACE FUNCTION document_save(p_document_id uuid, p_body jsonb, p_user uuid,
                                         p_source text, p_base integer)
RETURNS TABLE (number integer, overwrote_number integer, overwrote_by uuid)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_head integer; v_prev_by uuid;
BEGIN
  SELECT head_revision INTO v_head FROM project_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document % not found', p_document_id; END IF;
  INSERT INTO project_document_revisions (document_id, number, body, source, saved_by)
    VALUES (p_document_id, v_head + 1, p_body, p_source, p_user);
  UPDATE project_documents SET head_revision = v_head + 1, updated_at = now() WHERE id = p_document_id;
  IF p_base IS NOT NULL AND p_base <> v_head AND v_head >= 1 THEN
    SELECT saved_by INTO v_prev_by FROM project_document_revisions
      WHERE document_id = p_document_id AND project_document_revisions.number = v_head;
    RETURN QUERY SELECT v_head + 1, v_head, v_prev_by;
  ELSE
    RETURN QUERY SELECT v_head + 1, NULL::integer, NULL::uuid;
  END IF;
END; $$;

-- A block of keys in one round trip: returns the FIRST number; the caller uses first .. first+count-1.
CREATE OR REPLACE FUNCTION scrum_next_keys(p_project_id uuid, p_kind text, p_count integer)
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v integer;
BEGIN
  IF p_kind NOT IN ('story', 'task') THEN RAISE EXCEPTION 'bad kind %', p_kind; END IF;
  IF p_count < 1 OR p_count > 1000 THEN RAISE EXCEPTION 'bad count %', p_count; END IF;
  INSERT INTO scrum_counters (project_id) VALUES (p_project_id) ON CONFLICT (project_id) DO NOTHING;
  IF p_kind = 'story' THEN
    UPDATE scrum_counters SET story_seq = story_seq + p_count WHERE project_id = p_project_id RETURNING story_seq INTO v;
  ELSE
    UPDATE scrum_counters SET task_seq = task_seq + p_count WHERE project_id = p_project_id RETURNING task_seq INTO v;
  END IF;
  RETURN v - p_count + 1;
END; $$;

ALTER TABLE project_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_document_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON project_documents, project_document_revisions FROM anon, authenticated;
REVOKE ALL ON FUNCTION document_save(uuid, jsonb, uuid, text, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION scrum_next_keys(uuid, text, integer) FROM anon, authenticated;
```

Migration `2026-10-22_ai_credentials.sql` (same rules):

```sql
CREATE TABLE IF NOT EXISTS ai_credentials (
  user_id     uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  provider    text NOT NULL,
  base_url    text NOT NULL CHECK (char_length(base_url) <= 300),
  model       text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 120),
  gateway_id  text CHECK (char_length(gateway_id) <= 80),
  api_key_enc text NOT NULL CHECK (char_length(api_key_enc) <= 1000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_credentials_provider_valid CHECK (provider IN ('cloudflare', 'openai_compatible'))
);
ALTER TABLE ai_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_credentials FROM anon, authenticated;
```

The nightly prune (D5), `prod/2026-10/2026-10-22_document_revisions_cron.sql` after the analytics cron's
pattern (`cron.schedule` replaces a job of the same name; DEV runs the DELETE by hand when needed):

```sql
SELECT cron.schedule('prune_document_revisions', '20 9 * * *', $cron$
  DELETE FROM public.project_document_revisions r
   USING public.project_documents d, public.sprints s
   WHERE r.document_id = d.id AND d.sprint_id = s.id
     AND s.ends_at < (now() AT TIME ZONE 'America/Los_Angeles')::date - 7
     AND r.number <> d.head_revision
     AND (d.finalized_revision IS NULL OR r.number <> d.finalized_revision);
$cron$);
```

`supabase/schema.sql` mirrors all of this once applied (and loses the `projects.zoom_url`, `meeting_day`
and `meeting_time` columns it still shows: `2026-06-30_drop_legacy_project_meeting_columns.sql` dropped
them). `tests/scrum_support.py`'s `ScrumFake` gains `document_save` and `scrum_next_keys` emulation
beside `scrum_next_key`.

### The body (revision `body`, version 1)

```jsonc
{
  "v": 1,
  "product_name": null,            // string ≤ 120 or null → the project's name
  "goal": "",                      // ≤ 600 characters
  "stories": [                     // ≤ 20, in priority order
    {
      "id": "c0a8…",               // client-generated UUID, stable for the item's life
      "title": "As a student, I want … so that …",   // 1–200
      "description_md": null,      // ≤ 2000, Markdown (the board allows 20000; the plan is a summary)
      "story_id": null,            // server-owned: the user_stories row after export/import
      "tasks": [                   // ≤ 15
        { "id": "…", "title": "…", "estimate_hours": 4, "assignee_id": null, "tags": [], "task_id": null }
      ]
    }
  ],
  "roles": [ { "user_id": "…", "roles": ["Developer", "Scrum Master"] } ],  // ≤ 5 roles each, 1–40 chars
  "scrum_times": [                 // ≤ 7, the team's own times; TA slots are not stored here
    { "id": "…", "day_of_week": "tuesday", "start_time": "14:00", "duration_minutes": 30,
      "location": "BE 169", "ta_visit": false }
  ]
}
```

Worst case (20 stories × 15 tasks, every field at its cap) is about 140 KB; the row CHECK is 256 KB.
Rules the API enforces on save (422 otherwise): the shape and limits above; `estimate_hours` null or
1–15 (the board's `tasks_estimate_hours_valid`; null is allowed in a draft, refused at finalize, D9);
`tags ⊆ TASK_TAGS` (`scrum/controller.py`); `assignee_id` and `roles[].user_id` are current members
(one `project_members` read); item ids unique within the body; `day_of_week` lowercase weekday,
`start_time` `HH:MM`, `duration_minutes` null or a 15-minute step from 15 to 240 (the `meetings`
table's fence). The reserved role labels are `Scrum Master` and `Product Owner`, compared trimmed and
case-insensitively. "Initial task assignment" is not stored: it is each member's first task in plan
order. A linked item (D3, D19) keeps the fields of the head revision whatever the request says, except
that it may be removed from the body.

## Part 2 — Backend (documents and AI)

New module `backend/app/documents/` (`url.py`, `views.py`, `controller.py`, `models.py`, `body.py`,
`markdown.py`, `refine.py`, `notify.py`) and `backend/app/ai/` (`url.py`, `views.py`, `controller.py`,
`models.py`) for the personal keys, plus `app/core/llm.py` and `app/core/secrets.py`. Both routers are
registered in `app/main.py` next to `scrum_router`.

### Routes (`prefix="/api"`)

| Method, path | Who | Notes |
| --- | --- | --- |
| `GET /projects/{project_id}/sprints/{sprint_id}/plan` | member, staff | 404 `PLAN_NOT_FOUND` when none; `?revision=` picks a revision (default: head for members, finalized for staff when final) |
| `POST /projects/{project_id}/sprints/{sprint_id}/plan` | member | creates and seeds; 201; 409 `PLAN_EXISTS` |
| `PUT /documents/{document_id}` | member | `{body, base_revision}` → `{revision, overwrote}`; source `edit` |
| `GET /documents/{document_id}/revisions` | member, staff | `[{number, source, saved_by, saved_by_name, saved_at}]`, newest first |
| `GET /documents/{document_id}/revisions/{number}` | member, staff | that revision's body |
| `POST /documents/{document_id}/finalize` | scrum master; elevated when the project has none | D6, D9; stamps the head |
| `POST /documents/{document_id}/export` | same gate as finalize | finalizes the head first when needed, then exports the finalized revision |
| `POST /documents/{document_id}/import` | member | source `import` |
| `DELETE /documents/{document_id}` | same gate as finalize | drafts only, never finalized (409 `PLAN_FINAL`); 204; revisions cascade |
| `GET /documents/{document_id}/markdown` | member, staff | `text/markdown; charset=utf-8`; the finalized revision when final |
| `POST /documents/{document_id}/refine` | member, `5/minute` per user | `{kind, text, story_title?}` |
| `GET /classes/{class_id}/sprint-plans` | instructor, class TA | one row per team: the plan of the team's current sprint (today inside its dates), else its latest started one |
| `GET /ai/credentials` | signed in | `{configured, provider, base_url, model, gateway_id}` — never the key |
| `PUT /ai/credentials` | signed in | 503 `AI_KEYS_UNAVAILABLE` without `INTEGRATIONS_KEY` |
| `DELETE /ai/credentials` | signed in | 204 |
| `POST /ai/credentials/test` | signed in, `5/minute` per user | one tiny completion; `{ok, model, latency_ms}` |

The plan read returns `{document, body, revision, saved_by, saved_at, sprint, access, can_finalize,
can_export, ta_slots, ai}`: `ta_slots` are the team's weekly `meetings` rows (`cadence = 'weekly'`,
`project_id`; columns `sequence, day_of_week, start_time, duration_minutes, location, zoom_url`), `ai`
is `{enabled, source}`.

`GET /projects/{project_id}/scrum/summary` gains `plan: {document_id, status, head_revision,
finalized_revision, exported: bool} | null` for the sprint it reports (one extra read; its budget test
moves by one).

Rate limits keyed by user, not address (`search/views.py` `_search_rate_key`: on Vercel every request
arrives from the proxy). The board's `ai_draft` limiter keeps its address key; changing it is out of
scope but worth a line in the PR.

### Authorization

`documents.controller` reuses `scrum.controller._board_access` (`'member'` | `'staff'`, 403 otherwise)
and `_require_writer`. Role checks read `project_members.role` for the caller:

| Action | Rule |
| --- | --- |
| read, revisions, markdown | member or staff |
| create, save, import, refine | member |
| finalize, export, delete | role `scrum master`; or no member holds it and the caller's role is in `ELEVATED_ROLES` (`projects/controller.py`); delete only while the plan was never finalized |
| class list | class instructor or a class TA (`authz.get_enrollment_role`) |

Staff never write: the preview mode's read-only guarantee holds for them too. Nothing here changes a
project role (D6).

### Create (seed)

`create_plan(project_id, sprint_id, user_id)`: the sprint must belong to the project (404 otherwise).
Body = empty goal; `stories` = the sprint's board stories as linked items (the import mapping below), in
key order; `roles` and `scrum_times` copied from the head revision of the most recent earlier plan of
the project (by sprint `starts_at`), with members who left dropped; `product_name` copied too. Inserted
as revision 1, source `seed`. Round trips: access 1, sprint 1, stories+tasks 2 (fan-out), previous plan
2, members 1, insert 2 → budget 9.

### Save

`save_plan(document_id, user_id, body, base_revision)`: validate (Part 1), stamp links and linked
items' fields from the head body by item id (D19; a linked item whose id is absent from the request is
simply gone), call `document_save` (source `edit`). Response `{revision: n, overwrote: {number, by,
by_name} | null}`. Budget: doc 1, access 1, members 1, head body 1, RPC 1, name 1 → 6.

### Finalize

`finalize_plan`: the gate above; every task in the head body, linked ones included, must have
`estimate_hours` (409 `HOURS_REQUIRED` otherwise, D9); set `status='final'`,
`finalized_revision=head`, `finalized_at/by`; `events.record("sprint_plan_finalized")`; notify (below)
unless this revision was already finalized. No role check on the body: the checker's Scrum Master
warnings are advice.

### Export

`export_plan`: the gate; when `head_revision > finalized_revision` (or the plan is a draft) finalize
first, in the same call (so `HOURS_REQUIRED` applies); load the finalized body and the members; collect
unlinked stories and, under every story, unlinked tasks; `scrum_next_keys` once for stories and once
for tasks; one bulk insert into `user_stories` (`project_id, sprint_id, key, title, description_md,
reporter_id = caller`) returning ids; one bulk insert into `tasks` (`story_id, project_id, key, title,
estimate_hours, assignee_id, tags, status 'todo', reporter_id`); write the ids into the body;
`document_save` (source `export`) and stamp that revision as the finalized one (an export revision
differs from its parent only by links); `exported_at/by`; `scrum.controller._snapshot_burnup_safe
(client, sprint_id)` once; `events.record("sprint_plan_exported", meta={"stories": n, "tasks": m})`.
Stories are created in plan order, so their keys follow the plan's priority. Nothing is deleted or
updated on the board by an export. Response: the document, the new body, `{created: {stories,
tasks}}`. Budget ≤ 13. Two exports racing can both read an unlinked item; the client disables the button
while one runs, and the window is accepted (one scrum master per project).

### Import

`import_plan` (also the seed's mapping): read the sprint's stories and their tasks (two reads, one
fan-out); for every board story not linked in the body, append a linked item (title, description,
tasks with `estimate_hours`, `assignee_id`, `tags`, all linked) in key order; refresh every linked
item's copied fields from its row; for every linked story whose row is gone or whose `sprint_id` is no
longer this sprint, drop the item; same for linked tasks whose row is gone or moved to another story.
Status is never stored: the client reads it from the board. `document_save` (source `import`);
`events.record("sprint_plan_imported")`.

### Markdown

`markdown.render(document, body, project, sprint, members, ta_slots) -> str` in the template's order:
`# Sprint 2 Plan`, product/team, completion date (`ends_at`), revision number and date; `## Goal`;
`## Task listing` with `### 1. <story>` and `- <task> (4h)` lines, `Total: 12 hours` per story, from
the body's fields (linked items included: they are the snapshot); `## Team roles`; `## Initial task
assignment`; `## Initial burnup chart` and `## Initial scrum board` as links to the board; `## Scrum
times` with the TA slots first, each marked `(TA visits)`, then the typed rows with `(TA visits)` on a
flagged one. The route returns it as a file: `Content-Disposition: attachment;
filename="sprint-2-plan.md"` (slugified sprint name).

### Refine

`refine.py`: two system prompts, JSON only.

- `story`: rewrite the idea into one user story: `{"title": "As a <role>, I want <goal> so that
  <reason>", "description_md": "<≤ 60 words>", "tasks": [{"title", "estimate_hours": 1–6, "tags":
  [...]}]}` with 2–6 tasks, tags only from `TASK_TAGS`, keep the author's intent, invent nothing.
- `tasks`: for the given story title, 2–6 concrete tasks, each ≤ 6 hours, same task shape.

Post-processing: titles cut at 200, hours clamped to 1–15 (the checker warns above 6), tags filtered,
empty titles dropped, at most 6 tasks. Response `{draft, model, source: "platform" | "byok"}`. Quota:
with the platform provider, the `ai_draft_usage` read-modify-write of `scrum.controller.ai_draft`
(10/day, `AI_DAILY_LIMIT` at `controller.py:44`); with BYOK, no quota. 503 `AI_OFF` when neither is
available, 429 `AI_QUOTA`, 502 `AI_FAILED`. Prompts and completions are never logged; the log line
carries the model id, source, latency and status.

### `app/core/llm.py`

```python
@dataclass(frozen=True)
class Provider:
    kind: Literal["cloudflare", "openai_compatible"]
    base_url: str          # …/ai/v1 for Cloudflare
    api_key: str
    model: str
    gateway_id: str | None = None

def platform_provider(model: str | None = None) -> Provider | None   # None when AI_API_KEY is blank
def user_provider(client, user_id: str) -> Provider | None            # decrypts ai_credentials
def complete_json(p: Provider, *, system: str, user: str, max_tokens: int = 900,
                  timeout_s: float = 25.0, temperature: float = 0.3) -> tuple[dict, Usage]
```

`complete_json` POSTs `{base_url}/chat/completions` with `Authorization: Bearer`, `response_format:
{"type": "json_object"}`; for `kind == "cloudflare"` it adds `cf-aig-collect-log-payload: false` always
and `cf-aig-gateway-id` when set, and `chat_template_kwargs: {"enable_thinking": false}` only for
models in `THINKING_MODELS` (`glm-4.7-flash`, `glm-5.3-flash`, the Kimi and DeepSeek ids; verify at
build time that models without the parameter reject it, else send it always). `Usage` carries
`neurons` when the response has `usage.neurons`. Parse errors and HTTP errors raise `LlmError`.
`app/scrum/ai_draft.py` keeps its prompt and `snap_points` and calls `complete_json(platform_provider
(settings.AI_MODEL), …)`; `settings.AI_MODEL`'s default moves to `@cf/zai-org/glm-4.7-flash` (the
retired `llama-3.1-8b-instruct` default). New settings: `AI_MODEL_REFINE` (default
`@cf/ibm-granite/granite-4.0-h-micro`), `AI_GATEWAY_ID` (blank = none), `INTEGRATIONS_KEY`.

### `app/core/secrets.py` and `app/ai/`

`seal(text) -> str` / `open(token) -> str` with `cryptography.fernet.Fernet(settings.INTEGRATIONS_KEY)`
(`cryptography` is already a dependency through `PyJWT[crypto]`); blank key → `SecretsUnavailable` →
503 `AI_KEYS_UNAVAILABLE` on `PUT`. `PUT /ai/credentials` takes `{provider, model, api_key,
account_id?, gateway_id?, base_url?}`: for `cloudflare` the server builds
`https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1` (account id `^[0-9a-f]{32}$`); for
`openai_compatible` the `base_url` must be `https://`, have a host, carry no userinfo, and the host must
not be an IP literal, `localhost`, or end in `.local`, `.internal` or `.localhost` (the backend will POST
to it: the SSRF fence). The key is sealed, never returned, and Sentry scrubs it by name (`_KEY`).
`POST /ai/credentials/test` runs `complete_json` with a one-word prompt and `max_tokens=8`.

### Notifications and email (D13)

`NOTIFICATION_TYPES` gains `sprint_plan_finalized`; `notify.py` inserts one row per recipient
(`_insert_notifications`, title "Sprint plan finalized", body "<Project> finalized the <Sprint> plan",
`entity_type='document'`) and enqueues outbox kind `sprint_plan_finalized` (transactional, no category;
`dedupe_key = f"sprint_plan_finalized:{document_id}:{revision}:{user_id}"`, payload project, sprint,
team names and the plan URL under `FRONTEND_URL`). Recipients: `projects.assigned_ta_id` and every
`project_review_tas.user_id` for the project, deduplicated, the finalizer excluded.

### Events

`KINDS` gains `sprint_plan_created`, `sprint_plan_finalized`, `sprint_plan_exported`,
`sprint_plan_imported`, `ai_refine`, `class_sprints_scheduled`. `ai_refine` meta: `{"kind", "source",
"model", "neurons"}` — ids, enums and one number, no text. ⚑ (a number is within the "ids and enums"
rule's intent)

### Error details (fixed strings)

| Constant | Status | Detail |
| --- | --- | --- |
| `SPRINTS_PAST_END` | 422 | `The sprints run past the last day of classes (<date>)` |
| `SPRINTS_IN_USE` | 409 | `<Team> already uses Sprint <k>; lower the count after they move their stories or delete that plan` |
| `END_DATE_BEFORE_SPRINTS` | 409 | `Sprint <k> ends <date>; change the sprint schedule first` |
| `NO_SPRINT_SCHEDULE` | 409 | `This class has no sprint schedule yet` |
| `PLAN_NOT_FOUND` | 404 | `Sprint plan not found` |
| `PLAN_EXISTS` | 409 | `This sprint already has a plan` |
| `PLAN_FINAL` | 409 | `A finalized plan can't be deleted` |
| `SPRINT_NOT_IN_PROJECT` | 404 | `Sprint not found` |
| `FINALIZE_DENIED` | 403 | `Only the scrum master can finalize the plan` |
| `EXPORT_DENIED` | 403 | `Only the scrum master can export the plan` |
| `HOURS_REQUIRED` | 409 | `Every task needs an estimate in hours before the plan is final` |
| `ASSIGNEE_NOT_MEMBER` | 422 | `An assignee is not on the team` |
| `AI_OFF` | 503 | `AI refine is not configured` |
| `AI_QUOTA` | 429 | `Daily AI limit reached (10/day)` |
| `AI_FAILED` | 502 | `Refine failed — try again` |
| `AI_KEYS_UNAVAILABLE` | 503 | `Personal AI keys are not available on this server` |
| `BAD_BASE_URL` | 422 | `Enter an https:// address with a public host` |

Plus `authz.NOT_PROJECT_MEMBER`, `MEMBERS_ONLY` and `PROJECT_NOT_FOUND` as the board uses them.

## Part 3 — Web client

### Files

```
frontend/src/features/documents/
  pages/SprintPlanPage.tsx, SprintPlanPage.scss
  components/PlanHeader.tsx          heading, status pill, revision line, action buttons
  components/GoalSection.tsx
  components/StoriesSection.tsx      story rows with tasks; add, remove, move up/down; refine
  components/StoryRow.tsx, TaskRow.tsx
  components/RolesSection.tsx        members × role chips (reserved chips first, free text after)
  components/AssignmentTable.tsx     derived, read-only
  components/BurnupSection.tsx       BurnupChart from the board payload, or "Appears after export"
  components/ScrumTimesSection.tsx   TA slot rows (read-only) + typed rows + TA-visit radio
  components/ChecksPanel.tsx         the checker's list, grouped by severity
  components/RevisionsDrawer.tsx     Drawer: revision list, pick two, ChangeList
  components/ChangeList.tsx
  components/SlugSweep.tsx, SlugSweep.scss
  components/CreatePlanCard.tsx      the 404 state
  hooks/useSprintPlan.ts             load (plan + board in parallel), reducer, save, actions
  utils/planBody.ts                  types, empty body, ids, limits (mirrors Part 1)
  utils/checker.ts                   checkPlan(body, members, board, taSlots, projectScrumMasterId) → Finding[]
  utils/diff.ts                      diffBodies(a, b) → Change[]; wordDiff(a, b)
  utils/markdownName.ts
  __tests__/…
frontend/src/lib/api/documents.ts, frontend/src/lib/api/ai.ts   (spread into `api` in lib/api.ts)
frontend/src/lib/api/classes.ts                                  (updateClassSprints; create-class fields)
frontend/src/features/app/components/Classes/CreateClassModal.tsx   (schedule fields, Part 0)
frontend/src/features/app/components/Classes/ClassSettingsModal.tsx (Sprints section, Part 0)
frontend/src/features/app/components/Settings/AiSettings.tsx     (+ a section in pages/Settings.tsx)
frontend/src/features/app/components/TAManagement/…              (status chip per team row)
frontend/src/features/scrum/pages/ScrumBoardPage.tsx             ("Sprint plan" button; empty-state copy)
frontend/src/features/scrum/components/BurnupChart.tsx, TaskCard.tsx, TaskEditorModal.tsx (Part 0)
frontend/src/features/app/components/Project/SprintProgressCard.tsx (plan link + status)
frontend/src/App.tsx                                              (lazy route)
frontend/public/.well-known/grepthink-actions.json               (17 actions; role "scrum master" added to `roles`; update_sprint loses status)
```

Route: `/app/projects/:projectId/sprints/:sprintId/plan`, lazy like the board. The page loads
`api.getSprintPlan(projectId, sprintId)` and `api.getScrumBoard(projectId, sprintId)` in parallel; the
board payload supplies members, the sprint, the burnup and the live rows that linked items' status
overlay reads (no second plan endpoint for live data). A 404 from the plan shows `CreatePlanCard`
("Create sprint plan" for members; staff see "No plan yet"). Staff open the finalized revision when the
plan is final, with "Latest (rev 8)" one click away; members open the head.

### Entry points

- Board header (`ScrumBoardPage.tsx`, the `scrum-board__header-actions` block): a "Sprint plan"
  button left of the settings gear, enabled when a sprint is selected; it navigates to that sprint's
  plan.
- Project page sprint card (`SprintProgressCard.tsx`): under "Open board", "Sprint plan · Draft rev 3"
  or "Sprint plan · Final rev 5 (edited since)" from the summary's `plan`, or "Write the sprint plan"
  when none.
- TA schedule view (`TAManagement/TAScheduleView`): a `Badge` per team row — Draft / Final /
  Exported with the finalized revision — from `api.getClassSprintPlans(classId)`, fetched once beside
  the schedule and joined by `project_id`; the badge links to the plan.

### Editing

- **Goal**: `Textarea`, counter at 600.
- **Stories**: each story is a card with a title input, an optional description (Markdown textarea,
  collapsed by default), a task list, and up/down `IconButton`s for priority (no drag-and-drop in
  v1; the board's own drag is hand-rolled HTML5 with no keyboard path). A task row: title, hours
  (`type=number`, 1–15, "h", required for finalize), assignee (`Select` of members), tags (the board's
  `TagBadge` picker), remove. "Add task", "Add story". Story total "12h" computed as the board's
  `storyHours` (`features/scrum/utils/rollups.ts`) does.
- **Linked items** (D3): read-only, grey, with the board key, the live status chip from the board
  payload, a "changed on the board" marker when the live title, hours or assignee differ from the
  copy, and a link `/app/projects/:id/board?sprint=…&task=…` (the dependency link format). Items the
  board no longer has in this sprint show "moved off this sprint" until a re-import drops them.
- **Roles**: one row per member (name + avatar from the shared kit), chips; "Scrum Master" and
  "Product Owner" offered first, free text after (`Tag`/`FilterChip`). The project's actual scrum
  master and product owner show a small `Badge projectRole` next to their names.
- **Scrum times**: the TA slots first, read-only rows ("TA meeting · Tuesday 2:00 pm · 30 min · TA
  visits"); then the team's rows of weekday `Select`, time input, length `Select` (the meeting form's
  list), place; and, only when the team has no TA slot, one radio "TA visits this one" across the typed
  rows.
- **Save**: the header's primary button; `aria-busy` while saving as the board's Save does; the toast
  "Saved as revision 4". When the response has `overwrote`, the toast reads "Revision 4 replaced
  Alex's revision 3" with a "View changes" action that opens the drawer on 3 → 4. The page keeps
  `base_revision` = the revision it loaded or last saved.
- **Unsaved changes**: a `beforeunload` guard and a dirty marker on Save; no autosave (every save is a
  revision).
- **Preview mode**: the request layer throws `ReadOnlyPreviewError` on any write (`lib/previewGuard.ts`);
  the hook turns it into the calm info notice `useScrumBoard` shows (`noticeFor`, not a failure), and the
  page disables Save, Finalize, Export, Import and Refine while `usePreview()` reports the preview on.

### The checker (`utils/checker.ts`)

Pure; runs on every change; shown in `ChecksPanel` and summarised in the header ("3 warnings").

| id | severity | text |
| --- | --- | --- |
| `goal_missing` | warning | Write a one- or two-sentence goal. |
| `story_format` | warning | "<title>" doesn't read "As a …, I want …". |
| `story_no_reason` | info | "<title>" has no "so that …". |
| `story_no_tasks` | warning | "<title>" has no tasks. |
| `task_no_hours` | error | "<task>" needs an estimate in hours. |
| `task_over_six` | warning | "<task>" is over 6 hours; the template asks for 6 ideal hours or less. Split it. |
| `member_no_role` | warning | <name> has no role. |
| `scrum_master_count` | warning | Name exactly one Scrum Master. (0 or 2+) |
| `scrum_master_mismatch` | warning | <name> is named Scrum Master here, but <other> holds the role on the Team tab, which decides who can finalize and export. |
| `product_owner_missing` | info | No Product Owner named. |
| `member_no_task` | warning | <name> has no initial task. |
| `assignee_not_member` | error | A task is assigned to someone who left the team. |
| `capacity` | info | <total> h planned for <n> members over <w> weeks (about <n×10×w> h at 10 h each). |
| `scrum_times_few` | warning | Fewer than three scrum times (TA slots count). |
| `ta_visit_missing` | warning | Mark the meeting the TA visits. (only when the team has no TA slot) |

Errors block Finalize and Export in the client (the API refuses with 409 `HOURS_REQUIRED` and 422
`ASSIGNEE_NOT_MEMBER`). The capacity line's 10 h/week is a stated assumption in its own text; `w` is
the sprint's length in weeks. ⚑

### Revisions and the diff (`utils/diff.ts`)

`diffBodies(older, newer)` returns a flat change list, items matched by id:

- goal / product_name: `changed` with a word diff (longest-common-subsequence over whitespace-split
  words; ~40 lines, no dependency);
- stories: `added`, `removed`, `moved` (old → new position), `title`, `description`, `linked`; tasks
  the same plus `hours`, `assignee`, `tags`;
- roles: per member, roles added/removed; scrum times: added/removed/changed.

`RevisionsDrawer` lists revisions (number, who, when, source as a `Badge`: Seed / Edit / Import /
Export; the finalized one marked); the default comparison is the newest against the one before; two
can be picked. `ChangeList` renders each change as one line ("Task 'Set up CI' estimate 4h → 6h"),
word diffs inline with `<ins>`/`<del>`.

### The slug (`SlugSweep`)

A field-level effect for a refined title: two layers of the same width, the old text and the new text,
the new one laid out from the start so the height never jumps; a slug glyph (an SVG, 22 × 12, body in
`--gt-accent`, a trail at low alpha, eyes two dots) moves left to right over 900 ms with ease-in-out;
the new layer's `clip-path: inset(0 <100 − x>% 0 0)` grows with the slug and the old layer's
`inset(0 0 0 <x>%)` shrinks, so the slug "eats" the old text and leaves the new. While the request
runs the slug idles at the field's start with a slow bob and the field is read-only ("Cancel" ignores
the result). With `prefers-reduced-motion: reduce`: no slug; a 150 ms cross-fade and the label
"Refining…". After the sweep an `aria-live="polite"` region says "Refined", focus stays where it was,
and an "Undo" chip restores the previous title and tasks until the next save or the next refine of the
same item. Tasks the refine proposes are appended under the story with the same sweep per row.

Refine controls: on an unlinked story row, a sparkle `IconButton` with a `Menu`: "Refine into a user
story" (kind `story`, text = the title) and "Split into tasks" (kind `tasks`). Disabled with a
`Tooltip` when `ai.enabled` is false ("AI refine is not set up. Add a personal key in Settings.") and
when the daily limit is reached.

### Markdown export

"Download Markdown" calls the markdown route and saves `<sprint>-plan.md`; "Copy" puts the same text on
the clipboard (`navigator.clipboard.writeText`, toast "Copied").

### Settings → AI (`AiSettings.tsx`)

A section after Email preferences: provider `Select` (GrepThink's model · Cloudflare Workers AI, your
account · OpenAI-compatible API), the fields for the chosen one, model, key (`PasswordField`, write-only:
"Saved" state shows "Key saved" and a Replace button), Save, Test ("Works · granite-4.0-h-micro ·
1.2 s"), Remove. A note: "Personal ChatGPT or Claude subscriptions can't be used here: both require an
API key for apps like GrepThink. Your key is encrypted and used only for your own refines." When the
server answers 503 `AI_KEYS_UNAVAILABLE` the section explains that personal keys are off on this
server.

### Copy

| Where | Text |
| --- | --- |
| Create Class | Sprints · How many: 1–20 · Every: week / two weeks / month · First sprint starts: <date> · "Sprint 5 ends Dec 1" / "Sprint 5 would end after the last day of classes" |
| Class Settings | Sprints · Set up sprints · Save and update every team's sprints |
| Empty board | This class has no sprint schedule yet. Your instructor sets it in Class Settings. |
| Burnup card | Burnup in hours · Add points to tasks for a points burnup (7 tasks without points) · Points / Hours |
| Board header button | Sprint plan |
| Create card | Create sprint plan · "Seeded from the board and your last plan." |
| Header actions | Save · Finalize · Finalize & export · Export to board · Re-import from board · Download Markdown · Copy · Revisions · Latest (rev 8) / Finalized (rev 5) · Delete plan (drafts, in the overflow menu) |
| Delete confirm | Delete this draft plan? Its revisions go with it. |
| Status pill | Draft · Final · Exported (Final with `exported_at`) · edited since |
| Revision line | Revision 4 · saved 2 min ago by Alex |
| Finalize confirm | Finalize this plan? Your TA is notified. |
| Export confirm | Export 3 new stories and 11 tasks to the board? Linked items are left as they are. (prefixed "Finalize revision 8 and" when the head is newer) |
| Import confirm | Add the board's new stories to the plan, refresh linked items, and drop items the board no longer has? |
| Toasts | Saved as revision 4 · Revision 4 replaced Alex's revision 3 · Plan finalized. Your TA has been notified. · Exported 3 stories and 11 tasks · Plan updated from the board · Refine failed. Your text is unchanged. · Copied |
| Linked item hints | On the board · changed on the board · moved off this sprint |

### Accessibility

Every control is reachable by keyboard (up/down buttons for priority, radio for the TA visit, the
drawer and menus from the shared kit). The checker list is a `<ul>` with severity in text, not only
colour. The slug respects reduced motion and never moves focus. The dashed points chip has an
accessible name ("No points yet").

## Part 4 — Non-functional

- **Privacy.** A refine sends the item's text (and a story title) to Cloudflare through the shared
  DEV+PROD gateway with payload logging off, or to the user's own provider with BYOK; the UI says
  which. Nothing else from the plan leaves the server. Logs and Sentry carry ids, model ids and
  latencies, never text or keys.
- **Quotas.** Platform refines count against `ai_draft_usage` (10/day/user). At 100 students × 10
  refines × ~800 tokens the day costs under a million tokens, far inside the free Neuron allocation
  on either model.
- **Latency.** The gateway has answered identical requests in 0.8 s and in 17 s; the timeout is 25 s
  and the slug is the waiting state. Vercel's function limit is well above that.
- **Storage.** A body is a few kilobytes; a sprint's revisions are pruned a week after it ends (D5).
- **Serverless.** No in-process state; rate limits per user are best-effort per instance (as the
  search index's are); the DB quota is the real cap.
- **Security.** Service-role client, every route gated in Python (the IDOR rule); link fields and
  linked items server-owned (D19); BYOK URL fence (Part 2); keys sealed with Fernet and never
  returned.

## Part 5 — Tests and gates

Backend (`pytest`, `FakeSupabase` / `ScrumFake`):

- `tests/test_class_sprint_schedule.py`: the date arithmetic (weekly, biweekly, monthly incl. the
  31st → 30th clamp), `SPRINTS_PAST_END`, create-class requires the fields, `create_project` creates
  the team's sprints, PATCH regenerates (insert missing, update changed, delete empty extras,
  `SPRINTS_IN_USE`; an untouched seed does not count), unsequenced sprints untouched, the end-date
  route refusing a day before the last sprint, budgets.
- `tests/test_scrum_sprint_status.py`: derived status at each boundary (`_today_la` patched), default
  sprint selection, `update_sprint` ignores a status.
- `tests/test_scrum_burnup_units.py`: `_totals` in both units from task values (story points ignored),
  points available only when every task has them, snapshot columns, series per unit, pre-migration
  snapshots carried forward, the default unit choice, `?unit=` validation, `tasks_without_points`,
  `_sprint_progress` in the chosen unit.
- `tests/test_documents_access.py`: the matrix in Part 2 for every route (member, staff, outsider,
  scrum master, elevated-when-none, preview).
- `tests/test_documents_save.py`: validation (each limit), link and snapshot stamping (client values
  for a linked item ignored; kept by item id), last-writer-wins with and without `overwrote`, budget
  pins.
- `tests/test_documents_finalize_export.py`: the gate and the no-scrum-master fallback; no role
  change on finalize; `HOURS_REQUIRED` (typed and linked tasks); export finalizes a newer head first;
  key allocation (`scrum_next_keys` once per kind), bulk inserts, link write-back, burnup snapshot
  called once, idempotent re-export; notification rows and the outbox row with its dedupe key, sent
  once per finalized revision.
- `tests/test_documents_delete.py`: drafts only, the gate, revisions gone, `PLAN_FINAL`.
- `tests/test_documents_import.py`: seed from a sprint with stories; ad-hoc story added; copies
  refreshed; moved and deleted rows dropped; roles carried from the previous plan.
- `tests/test_documents_markdown.py`: golden file of a full plan from a finalized revision, TA slots
  first.
- `tests/test_llm.py`: headers (`cf-aig-collect-log-payload`, gateway id, thinking off only for
  listed models), JSON parse failure → `LlmError`, timeout; `ai_draft` still passes its own tests.
- `tests/test_ai_credentials.py`: seal/open round trip, key never in any response, URL fence cases
  (shared case table with the web client, as `external-tasks-url-cases.json` is), 503 without
  `INTEGRATIONS_KEY`, test endpoint.
- The API client drift check (backend/README.md; PR #235 when merged): client methods and catalog
  entries for all 17 routes and the changed `update_sprint`.

Web (`vitest`): `CreateClassModal` (fields required, the computed last day and its warning),
`ClassSettingsModal` Sprints section, `BurnupChart` unit label and toggle, `TaskCard` dashed chip,
`checker.test.ts` (one case per rule), `diff.test.ts` (each change kind, word diff),
`planBody.test.ts`, `SprintPlanPage.test.tsx` (load, create, save with `overwrote` toast, linked rows
read-only with the changed marker, staff open the finalized revision, finalize blocked by an error,
export confirm, preview disables writes), `SlugSweep.test.tsx` (reduced motion path, undo),
`AiSettings.test.tsx`, `apiFacade.test.ts` METHODS, `responseShapes`. Harness: `frontend/plan-mock.html`
+ `frontend/plan-mock/` (git-excluded, as the scrum harness), launch config `plan-mock` on :5185, with
`?access=staff`, `?status=final`, `?ai=off`; the scrum harness's in-memory board gains the burnup
`unit` fields.

Gates before each PR: backend `ruff format && ruff check && pytest`; frontend `npm run lint && npm run
lint:design && npm run build && npx vitest run`.

## Part 6 — Rollout

Four PRs onto `beta`, in order: 0, A, B, C (B's page needs A's routes and 0's sprints; C's refine
controls live on B's page; C's backend half can start once A merges). Stacked PRs are retargeted on
merge, or opened one at a time (the #225–#228 lesson: GitHub retargets only when the base branch is
deleted).

- **PR 0, board groundwork (Part 0):** the class schedule migration and the burnup-hours migration
  (DEV applied before the tests run against it), `scrum/schedule.py`, create-class and class-settings
  changes, `ensure_project_sprints` and its hook, derived status, burnup units and the points nudge,
  `lib/api/classes.ts`, catalog, AGENTS.md (sprints come from the class; status derived).
- **PR A, documents backend + client contract:** both documents migrations and the prune cron file,
  `app/documents` without refine (delete included), the summary's `plan`, the class list, the plan
  rule in `ensure_project_sprints`'s in-use check, notifications, email kind, events,
  `lib/api/documents.ts`, catalog, AGENTS.md (module list, gotchas: links and linked items
  server-owned, last writer wins, nightly prune).
- **PR B, the plan page:** everything in Part 3 except refine, the slug and Settings → AI; the three
  entry points; the harness.
- **PR C, AI:** `core/llm.py`, `core/secrets.py`, the `ai_draft.py` refactor and default model change,
  `app/ai`, the refine route and prompts, `lib/api/ai.ts`, `AiSettings`, `SlugSweep` and the refine
  controls, `.env.example` (`AI_MODEL_REFINE`, `AI_GATEWAY_ID`, `INTEGRATIONS_KEY`), Vercel env
  (`INTEGRATIONS_KEY` on both environments before release; without it personal keys are simply off).

PROD: apply the four migrations immediately before the release merge; they are expand-only, nothing
to contract; the prune cron file runs after them. Existing PROD classes get their sprints when their
instructor sets a schedule in Class Settings (the release notes say so). `supabase/schema.sql` is
regenerated after PROD, as its own commit.

### Out of scope, named follow-ups

Release plan and sprint report kinds (templates to come); comments on a plan; calendar rows for scrum
times (the schedule work's Plan D); streaming; drag-and-drop ordering; PDF; the board's `ai_draft`
limiter keyed by user; a "generate the whole plan from the goal" action; moving project roles from a
plan; removing the `create_sprint` route and dropping `sprints.status`; a nudge in the instructor's
attention summary for a class without a sprint schedule.

## What is left to the builder

The exact SCSS of the page within the design tokens; the slug's drawing and the dashed chip's look;
the prompt wording beyond the shapes above; the order of sections on narrow screens (single column);
the golden Markdown fixture; the 10-prompt model quality check that decides granite versus glm
(recorded in the PR body with the chosen default); the exact layout of the Sprints fields in the two
class modals.

## Builder check log

- 2026-10-22, round 1 (Opus at max effort, fresh agent, read against beta): five questions. Settled:
  roles never move from a plan and the one-person-team fallback (D6, D7); linked items are a snapshot
  with a live overlay and staff read the finalized revision (D3, D15); TA slots come from `meetings`
  and count as the TA's visit (D16); C follows B; body limits reduced so the worst case fits the row
  cap; the export race is accepted. Two went to the maintainer and came back as D20–D22 and D9's
  "hours required".
- 2026-10-22, round 2 (same setup, on Part 0 and D20–D22): three questions, all settled here. Points
  scope counts tasks, and points are available only when complete (D21); an untouched seed does not
  block a schedule change and drafts can be deleted (D20, the delete route); the last-day route refuses
  a day before the last sprint ends (D20). No question is left for the maintainer.

## Sources (research 2026-10-22)

- Cloudflare: planned model deprecations (2026-05-30) https://developers.cloudflare.com/changelog/post/2026-05-08-planned-model-deprecations/ ; models https://developers.cloudflare.com/workers-ai/models/ ; pricing https://developers.cloudflare.com/workers-ai/platform/pricing/
- Anthropic consumer terms on OAuth tokens in third-party products: https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546
- OpenAI Sign in with ChatGPT, plan usage for open-source and local apps: https://developers.openai.com/siwc and https://developers.openai.com/siwc/request-client-id
- Jira "Break down with Rovo", Confluence highlight-to-issue; Shortcut Korey and Docs; Linear Agent: see `docs/superpowers/plans/2026-10-21-sprint-plan-docs-brainstorm.md`
