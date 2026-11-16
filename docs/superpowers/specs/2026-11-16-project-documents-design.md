# Project Documents — Design Spec

**Date:** 2026-11-16
**Base:** `origin/beta` at `f2913662`.
**Status:** draft for the maintainer's approval. Decisions marked ⚑ are mine; the others are the
maintainer's (2026-10-21 to 2026-11-16). Nothing in this spec is built.
**Supersedes** Parts 1 to 6 of `2026-10-22-sprint-plan-docs-design.md` (its Part 0, the class sprint
schedule and the burnup units, shipped in 0.92.0). That spec's sprint-plan decisions D1 to D9 and D13 to
D19 still hold and are restated here where they apply; D10 to D12 (AI refine, the shared model client,
personal API keys) are withdrawn: see "Out of scope".

## The ask

CSE 115A teams keep five documents as Google Docs made from the professor's templates. Bring them into
GrepThink, built from the board wherever the board already knows the answer, so students write only
what nobody else can:

| Document | When | Template |
| --- | --- | --- |
| Sprint plan | start of each sprint | Sprint Plan Template (2023-06-25) |
| Sprint report | end of each sprint | Sprint Report Template (2012-09-26) |
| Release plan | living: written at release planning, revisited after every sprint | Release Plan Template (2023-04-10) |
| Release summary | once, at the end of the class | Release Summary Template (2023-05-26) |
| Test plan and report | once, at the end of the class | Test Plan and Report Template (2023-05-26) |

The maintainer's order (2026-11-16): **end-of-term documents first** (sprint report, release summary,
test plan and report), because Fall's last day of classes is 2026-12-04; then the release plan as a live
view on the board; then the sprint plan.

## What each document is made of

| Document | Typed by the team | Derived from the board |
| --- | --- | --- |
| Sprint report | actions to stop, start and keep doing, each with a reason | heading; stories completed and not completed; stories, ideal hours and days of the sprint; per-day rates; averages over the sprints so far; the sprint's final burnup |
| Release summary | known problems (bugs, omissions, design shortcuts); follow-on items | heading; key stories with their acceptance criteria (picked from the board); the product backlog |
| Test plan and report | system test scenarios (steps, pass or fail), unit-test locations and whether any fail | heading; the stories and acceptance criteria each scenario covers; the team's repositories |
| Release plan | release name and date, high-level goals | stories per sprint in priority order with points; totals per sprint against capacity; the product backlog |
| Sprint plan | goal, stories and tasks with hours, team roles, scrum times | heading, totals, initial assignments, burnup, board (as the 2026-10-22 spec has it) |

## Goals, non-goals, anti-goals

**Goals.** A team finishes an end-of-term document in one sitting: what the board knows is already on
the page. A TA finds every team's documents in one place and reads the version that was handed in. A
document handed in does not change underneath its reader.

**Non-goals.** A general document editor; live co-editing; PDF; comments on a document; grading;
AI drafting inside the page (deferred); personal API keys (dropped).

**Anti-goals.** A second backlog that drifts from the board. Numbers a student has to compute by
hand. Student text in logs.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| P1 | **One engine, five kinds.** `project_documents.kind` is `sprint_plan`, `sprint_report`, `release_plan`, `release_summary` or `test_report`; each kind registers its body model, its seed, its derived sections and its Markdown renderer in one table (`app/documents/kinds.py`). | The 2026-10-22 spec named the tables by kind for this. |
| P2 | **Structured bodies** (typed fields; Markdown only inside free-text fields). | maintainer (D1) |
| P3 | **Every save is a revision; last writer wins**, and the response says when it replaced a revision the saver never saw. | maintainer (D4) |
| P4 | **Derived sections are live while a document is a draft and frozen when it is finalized.** Finalizing stores the derived sections beside the body in that revision (`snapshot`, written only by the server); readers of a final document, the Markdown and the TA see the snapshot. ⚑ | The sprint report's rates and the summary's backlog would otherwise change after hand-in. Generalises D3. |
| P5 | **Draft → Final by the team's Scrum Master or Product Owner** (an owner or admin too). A later save reopens nothing: the document stays final at the finalized revision and shows "edited since" until finalized again. The release plan has no final state: it only has saved revisions. ⚑ | D6 gave this to the scrum master; the release summary and release plan are the Product Owner's documents, and one rule for every kind is easier to explain. |
| P6 | **A story is completed when it has at least one task and every task is done.** | maintainer (2026-11-16) |
| P7 | **Stories gain a priority order and acceptance criteria.** `user_stories.rank` orders stories within their sprint or the backlog; `user_stories.acceptance_criteria` is a list of short statements. | maintainer (2026-11-16): the release plan needs the order, the summary and the test scenarios hang off the criteria |
| P8 | **The release plan is a live view of the board**, in a "Release plan" tab that replaces the Burnup tab; the burnup charts move into that tab's Progress section. ⚑ (where the charts go) | maintainer (2026-11-16). The templates still ask for burnups, so they move, not go. |
| P9 | **A "Documents" tab on the board lists the team's documents**; each opens on its own page. Class staff get one list per class. ⚑ | maintainer (D14: lives on the board) |
| P10 | **Finalizing notifies the team's meeting TA and review TAs**, in the app and by email through the outbox, once per finalized revision. | maintainer (D13) |
| P11 | **Markdown export** for every kind, rendered by the server in the template's order. | maintainer (D15) |
| P12 | **Revisions are pruned**: a sprint document keeps only its head and finalized revisions from 7 days after its sprint ends; a project-level document from 30 days after the class's last day. ⚑ (the 30 days) | maintainer (D5) |
| P13 | **Sprint plan: draft, then export by the Scrum Master only**, linked items and re-import as D2, D3, D7, D8 and D19 have them; hours required (D9). | maintainer |
| P14 | **Access is the board's**: team members write, class staff read. | D-carry |

## Part 1 — Board groundwork (PR 1)

Migration `backend/database/migrations/2026-11/2026-11-16_story_rank_and_criteria.sql` (expand,
idempotent; no client grants):

```sql
ALTER TABLE public.user_stories ADD COLUMN IF NOT EXISTS rank integer;
ALTER TABLE public.user_stories ADD COLUMN IF NOT EXISTS acceptance_criteria text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.user_stories DROP CONSTRAINT IF EXISTS user_stories_criteria_valid;
ALTER TABLE public.user_stories ADD CONSTRAINT user_stories_criteria_valid
  CHECK (cardinality(acceptance_criteria) <= 20);
CREATE INDEX IF NOT EXISTS user_stories_project_rank_idx ON public.user_stories (project_id, sprint_id, rank);

-- One statement orders a whole list: rank = position in p_story_ids. Stories of another project
-- are not touched.
CREATE OR REPLACE FUNCTION public.scrum_set_story_order(p_project_id uuid, p_story_ids uuid[])
RETURNS integer LANGUAGE sql SET search_path = public AS $$
  WITH ordered AS (SELECT id, ord FROM unnest(p_story_ids) WITH ORDINALITY AS t(id, ord)),
  done AS (
    UPDATE user_stories s SET rank = o.ord::integer
      FROM ordered o WHERE s.id = o.id AND s.project_id = p_project_id
    RETURNING 1)
  SELECT count(*)::integer FROM done;
$$;
REVOKE ALL ON FUNCTION public.scrum_set_story_order(uuid, uuid[]) FROM anon, authenticated;
```

- **Order.** Stories sort by `rank` (NULLs last), then by key as today, everywhere a list of stories
  is built (`get_board`'s sprint stories and backlog). A new story takes no rank and so lands last.
- `PUT /api/projects/{project_id}/scrum/stories/order` (team members): `{sprint_id: uuid | null,
  story_ids: [uuid]}`. The ids must be exactly the live stories of that sprint (or of the backlog for
  null), else 409 `Stories changed; reload and try again`. Answers `{"story_ids": [...]}`. The web
  client gets up and down buttons on backlog rows and on story cards (keyboard-reachable; no drag in
  this PR).
- **Acceptance criteria.** `CreateStoryRequest` and `UpdateStoryRequest` take `acceptance_criteria:
  list[str]` (at most 20, each 1 to 300 characters after trimming); `StoryOut` returns it. The story
  editor and the story modal get an "Acceptance criteria" list editor (add, edit, remove, reorder with
  up and down) above the description, whose placeholder loses "Acceptance criteria".
- **Connector.** `get_board_context` returns each story's criteria and `fill_board` accepts them on a
  story, with the same limits; the tool description says to put criteria there, not in the
  description.
- Tests: order route (happy path, stale list, another project's id ignored), sort order on the board,
  criteria validation, connector round trip; a rolled-back check of `scrum_set_story_order` on DEV.

## Part 2 — The engine (PR 2)

Migration `2026-11-16_project_documents.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.project_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind               text NOT NULL,
  sprint_id          uuid REFERENCES public.sprints(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'draft',
  head_revision      integer NOT NULL DEFAULT 0,
  finalized_revision integer,
  finalized_at       timestamptz,
  finalized_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_documents_kind_valid CHECK (kind IN
    ('sprint_plan', 'sprint_report', 'release_plan', 'release_summary', 'test_report')),
  CONSTRAINT project_documents_status_valid CHECK (status IN ('draft', 'final')),
  CONSTRAINT project_documents_sprint_shape CHECK (
    (kind IN ('sprint_plan', 'sprint_report')) = (sprint_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS project_documents_sprint_kind_uq
  ON public.project_documents (sprint_id, kind) WHERE sprint_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_documents_project_kind_uq
  ON public.project_documents (project_id, kind) WHERE sprint_id IS NULL;

CREATE TABLE IF NOT EXISTS public.project_document_revisions (
  document_id uuid NOT NULL REFERENCES public.project_documents(id) ON DELETE CASCADE,
  number      integer NOT NULL CHECK (number >= 1),
  body        jsonb NOT NULL,
  snapshot    jsonb,                        -- derived sections, frozen by finalize (P4)
  source      text NOT NULL DEFAULT 'edit',
  saved_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  saved_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, number),
  CONSTRAINT project_document_revisions_source_valid
    CHECK (source IN ('seed', 'edit', 'import', 'export', 'finalize')),
  CONSTRAINT project_document_revisions_size
    CHECK (pg_column_size(body) <= 262144 AND (snapshot IS NULL OR pg_column_size(snapshot) <= 262144))
);
ALTER TABLE public.project_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_document_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_documents, public.project_document_revisions FROM anon, authenticated;
```

plus `document_save(p_document_id, p_body, p_snapshot, p_user, p_source, p_base)` as the 2026-10-22
spec wrote it (row lock, next number, head bump, the overwrote notice), with the snapshot stored
beside the body, and a pg_cron prune file under `prod/2026-11/` for P12. Every function is revoked
from browser roles and pins `search_path`. A rolled-back run on DEV checks the constraints and the
save function before the branch is tested there.

**Module `backend/app/documents/`** (`url`, `views`, `controller`, `models`, `kinds`, `derive`,
`markdown`, `notify`), routes under `/api`:

| Method, path | Who | Notes |
| --- | --- | --- |
| `GET /projects/{project_id}/documents` | member, staff | the Documents tab: one row per possible document (existing or not), with status, revisions and who saved last |
| `POST /projects/{project_id}/documents` | member | `{kind, sprint_id?}`; seeds; 409 when it exists |
| `GET /documents/{document_id}` | member, staff | `?revision=`; body, derived sections (live, or the snapshot when final and the reader asks for the finalized revision; staff default to it), access flags |
| `PUT /documents/{document_id}` | member | `{body, base_revision}` → `{revision, overwrote}` |
| `GET /documents/{document_id}/revisions`, `…/revisions/{number}` | member, staff | |
| `POST /documents/{document_id}/finalize` | Scrum Master, Product Owner, owner, admin | runs the kind's blocking checks (409 with the first failure), stores a `finalize` revision with the snapshot, notifies (P10) |
| `DELETE /documents/{document_id}` | same as finalize | never-finalized documents only |
| `GET /documents/{document_id}/markdown` | member, staff | the finalized revision when final |
| `GET /classes/{class_id}/documents` | instructor, class TA | one row per team and kind: status, finalized revision, last save |

Authorization reuses the board's access rule (`scrum.controller._board_access`); role checks read
`project_members.role`. Every route gates in the controller. Notification type `document_finalized`,
outbox kind `document_finalized` (transactional, `dedupe_key` of document, revision and recipient),
events `document_created` and `document_finalized` with ids and the kind only.

### Kinds built in PR 2

**Sprint report** (`sprint_report`, one per sprint).
Body: `stop`, `start`, `keep`: lists (each at most 10) of `{id, action (1–200), reason (≤ 400)}`;
`satisfied_note` (≤ 600) for a team with nothing to stop.
Derived (`derive.sprint_report`): the sprint's stories split by P6 into completed and not completed
(key, title, points, hours); `stories_completed`; `hours_completed` (the estimate hours of done
tasks); `days` (the sprint's length, both end days counted); stories per day and hours per day; the
same two averages over every sprint of the team that has ended, this one included; the sprint's final
burnup series in the board's unit. Seed: empty lists. Blocking checks at finalize: the sprint has
ended (409 `The sprint has not ended yet`); `start` and `keep` each have an item; `stop` has an item
or `satisfied_note` is filled.

**Release summary** (`release_summary`, one per project).
Body: `key_story_ids` (at most 30 board stories, in the team's chosen order); `known_problems`: at
most 40 of `{id, kind: bug | omission | shortcut, text (1–400)}`; `follow_ups`: at most 20 of
`{id, text}` (bug fixes and ideas that are not stories). Derived: each key story's key, title,
acceptance criteria and completed flag; the product backlog (backlog stories and stories not completed,
in rank order, with points). Seed: `key_story_ids` = the completed stories, in rank order. Blocking
checks: at least one key story; every key story has at least one acceptance criterion (the page links
to the story to add them).

**Test plan and report** (`test_report`, one per project).
Body: `scenarios`: at most 60 of `{id, title (1–120), story_ids (≤ 5), steps_md (≤ 2000), result: pass
| fail | null, note (≤ 300)}`; `unit_tests`: at most 20 of `{id, location (a path or URL, ≤ 300),
note (≤ 300), failing: bool}`; `unit_tests_note` (≤ 600). Derived: for each scenario its stories' keys,
titles and criteria; the team's registered repositories (`scrum_repos`, URLs only) as suggestions for
unit-test locations; stories with criteria that no scenario covers. Seed: one scenario per completed
story that has criteria, titled from the story, its steps pre-filled as a numbered list of the
criteria, result unset. Blocking checks: at least one scenario; every scenario has a result.

Each kind's Markdown follows its template's headings; the heading block (document name, product name,
team name, date, and revision where the template asks) comes from the project, the sprint and the
revision.

## Part 3 — The web client (PR 3)

- `BOARD_VIEWS` gains `documents`. The tab lists, in order: Release plan (a link to its tab, from PR
  4), each sprint with its plan (from PR 5) and report, Release summary, Test plan and report; each
  row shows a status badge (Not started, Draft, Final, Final · edited since), the revision and who
  saved last, and opens or creates the document. The project page's sprint card links to the tab.
- `/app/projects/:projectId/documents/:documentId` (lazy route): a shared shell (heading, status,
  revision line, Save, Finalize, Download Markdown, Copy, Revisions, Delete for drafts) around one
  editor per kind in `frontend/src/features/documents/`. Derived sections render read-only with a
  "From the board" label; a final document shows its snapshot, with "Latest draft" one click away.
- Sprint report: three action lists; the two story lists; a small table of the rates; the burnup chart.
- Release summary: a story picker (search, reorder) showing each story's criteria with an "Edit on
  the board" link; the known-problems list with a kind chip; the backlog.
- Test report: scenario cards (title, stories picker, steps, Pass/Fail segmented control, note); the
  uncovered-stories hint; the unit-tests list.
- A revisions drawer with an item-level diff (added, removed, changed, moved; word diff for text), a
  checks panel that mirrors the blocking checks and adds warnings, an unsaved-changes guard, the
  overwrote notice, preview mode read-only, as the 2026-10-22 spec describes them.
- TA schedule view: a documents badge per team from the class list, linking to the Documents tab.
- Web client methods in `lib/api/documents.ts`, catalog entries for every route, a harness page with
  mock data for the three editors.

## Part 4 — Release plan (PR 4)

- Kind `release_plan` (one per project). Body: `release_name` (≤ 120), `release_date`, `goals`: at
  most 12 of `{id, text (1–300)}`, `notes` (≤ 1000). Derived: every sprint with its stories in rank
  order (key, title, points), points per sprint and in total; capacity checks (a sprint whose points
  exceed the average of the team's completed sprints by more than half; stories without points;
  stories too big to have fit one sprint are not detectable and are left to the team); the product
  backlog in rank order. No final state: "Save revision" stores the body with a snapshot, and the
  revision number and date are the heading's.
- The board's Burnup tab becomes **Release plan**: goals and release details (editable in place),
  the sprints with their stories (reorder, move between sprints and the backlog, add a story: all
  through the board's own routes, so the board and the plan cannot differ), the backlog, and a
  Progress section holding the cumulative and per-sprint burnup charts with the unit toggle and the
  points nudge as they are today. `?view=burnup` keeps working and opens the new tab at Progress.
- The Backlog tab stays as it is.

## Part 5 — Sprint plan (PR 5)

As the 2026-10-22 spec's Parts 1 to 3 describe it, on this engine: body version 1, seed from the
board and the previous plan, link stamping, export by the Scrum Master with `scrum_next_keys`,
re-import, the checker, `HOURS_REQUIRED` at finalize. Exported stories take their plan order as
their rank. Without the refine controls.

## Rollout

Five PRs onto `beta`, in order. PRs 1 and 2 carry SQL (label `needs-prod-sql`; DEV first, PROD
before the release that ships them; both expand-only). Realistic reach before 2026-12-04: PRs 1 to 3.
PR 4 and PR 5 follow, in time for the next term's first sprint.

## Out of scope, named follow-ups

- In-page AI refine (deferred by the maintainer, 2026-11-16) and personal API keys (dropped). The
  board connector already lets a student's own assistant draft stories; teaching it to draft a
  document is a later connector change.
- Comments on a document; grading or rubric; PDF; drag-and-drop ordering; a due date per document
  on the class schedule; documents for classes other than the 115 series' templates.

## What is left to the builder

Styles within the design tokens; the diff's exact rendering; the Markdown fixtures; round-trip
budgets for each route (pinned in tests once measured); the harness.
