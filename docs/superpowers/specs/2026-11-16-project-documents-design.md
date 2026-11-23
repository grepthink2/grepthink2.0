# Project Documents — Design Spec

**Date:** 2026-11-16
**Base:** `origin/beta` at `f2913662`.
**Status:** agreed. Decisions marked ⚑ are mine; the others are the maintainer's (2026-10-21 to
2026-11-16). Parts 1 to 3 shipped in #329, #330 and #331 (merged 2026-11-17, released in 0.95.0);
Parts 4 and 5 (release plan, sprint plan) are not built.
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
idempotent; no client grants; the function as amended below):

```sql
ALTER TABLE public.user_stories ADD COLUMN IF NOT EXISTS rank integer;
ALTER TABLE public.user_stories ADD COLUMN IF NOT EXISTS acceptance_criteria text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.user_stories DROP CONSTRAINT IF EXISTS user_stories_criteria_valid;
ALTER TABLE public.user_stories ADD CONSTRAINT user_stories_criteria_valid
  CHECK (cardinality(acceptance_criteria) <= 20);
CREATE INDEX IF NOT EXISTS user_stories_project_rank_idx ON public.user_stories (project_id, sprint_id, rank);

-- Orders one list: one sprint's live stories, or the backlog when p_sprint_id is NULL. Refuses (23505)
-- unless p_story_ids are exactly the list's stories, each once; then rank = position in p_story_ids.
CREATE OR REPLACE FUNCTION public.scrum_set_story_order(
  p_project_id uuid,
  p_sprint_id uuid,
  p_story_ids uuid[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  listed uuid[];
  sent uuid[];
  ranked integer;
BEGIN
  -- The list's stories, locked in id order (the backlog rule of _in_backlog for a NULL sprint).
  SELECT coalesce(array_agg(l.id ORDER BY l.id), '{}') INTO listed
    FROM (
      SELECT id FROM user_stories
       WHERE project_id = p_project_id
         AND ((p_sprint_id IS NULL AND (sprint_id IS NULL OR archived_at IS NOT NULL))
              OR (sprint_id = p_sprint_id AND archived_at IS NULL))
       ORDER BY id
       FOR UPDATE
    ) AS l;
  SELECT coalesce(array_agg(DISTINCT u.id ORDER BY u.id), '{}') INTO sent
    FROM unnest(p_story_ids) AS u(id);
  IF cardinality(sent) <> cardinality(p_story_ids) OR sent IS DISTINCT FROM listed THEN
    RAISE EXCEPTION 'stories changed' USING ERRCODE = 'unique_violation';
  END IF;
  UPDATE user_stories s SET rank = o.ord::integer
    FROM unnest(p_story_ids) WITH ORDINALITY AS o(id, ord)
   WHERE s.id = o.id AND s.project_id = p_project_id;
  GET DIAGNOSTICS ranked = ROW_COUNT;
  RETURN ranked;
END;
$$;
REVOKE ALL ON FUNCTION public.scrum_set_story_order(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scrum_set_story_order(uuid, uuid, uuid[]) TO service_role;
```

- **Order.** Stories sort by `rank` (NULLs last), then by key as today, everywhere a list of stories
  is built (`get_board`'s sprint stories and backlog). A new story takes no rank and so lands last.
- `PUT /api/projects/{project_id}/scrum/stories/order` (team members): `{sprint_id: uuid | null,
  story_ids: [uuid]}`. The ids must be exactly the live stories of that sprint (or of the backlog for
  null), else 409 `Stories changed; reload and try again`; the function checks this under its lock.
  Answers `{"story_ids": [...]}`. The web client gets up and down buttons on backlog rows and on story
  cards (keyboard-reachable; no drag in this PR).
- **Acceptance criteria.** `CreateStoryRequest` and `UpdateStoryRequest` take `acceptance_criteria:
  list[str]` (at most 20, each 1 to 300 characters after trimming); `StoryOut` returns it. The story
  editor and the story modal get an "Acceptance criteria" list editor (add, edit, remove, reorder with
  up and down) above the description, whose placeholder loses "Acceptance criteria".
- **Connector.** `get_board_context` returns each story's criteria. `fill_board` does not take them in
  this PR (amended below); the tool description says a story's criteria are their own list on the
  board, and that a new story still carries its criteria in its description for now.
- Tests: order route (happy path, stale list, another project's id refused), sort order on the board,
  criteria validation, connector read; a rolled-back check of `scrum_set_story_order` on DEV.

**Amended 2026-11-16** (while building PR 1, after its review):

1. `scrum_set_story_order` takes the sprint (`p_sprint_id`, NULL for the backlog) and checks the list
   itself: it locks the list's stories in id order and refuses with 23505 ("stories changed", the
   API's 409) unless the ids are exactly those stories, each once, so no story can leave or join the
   list between the check and the write. It is plpgsql, SECURITY INVOKER. The route keeps its access
   check and the 404 for a sprint of another project. `update_story` clears a story's rank on every
   move to another list, whenever the row has the column.
2. The function is revoked from PUBLIC too, not only from `anon` and `authenticated`, and granted to
   `service_role`, as every other function migration here does: PUBLIC holds EXECUTE on a new function
   by default.
3. `fill_board` does not take criteria in this PR. The connector reads them; writing them waits for a
   connector tool that can update existing stories (`scrum_fill_board` only creates new ones).
4. `POST /api/projects/{project_id}/scrum/stories` answers the story itself, not `{message, story}`:
   the route was touched, so it moved to the current response shape, with a client that reads both.

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
| `GET /projects/{project_id}/documents/stories` | member, staff | added in PR 3 (its amendment, item 5): every live story of the board in board order, for the story pickers; writes nothing |
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

**Amended 2026-11-17** (while building PR 2):

1. The migration is `2026-11/2026-11-17_project_documents.sql`, and four functions write the tables, each
   plpgsql, SECURITY INVOKER, `search_path` pinned, executable by `service_role` only:
   `document_create(p_project_id, p_kind, p_sprint_id, p_body, p_user)` (the document and its revision 1,
   source `seed`; a second one is 23505, the API's 409), `document_save(p_document_id, p_body, p_user,
   p_source, p_base)` (no snapshot: it answers `number, overwrote_number, overwrote_by`; P0002 for no such
   document), `document_finalize(p_document_id, p_revision, p_snapshot, p_user)` and
   `prune_document_revisions()`, run daily at 09:20 UTC by `prod/2026-11/2026-11-17_document_revisions_cron.sql`.
2. Finalize adds no revision: it stamps the head. `source` allows `seed`, `edit`, `import` and `export`
   only. The request names the revision the caller is looking at (`{revision}`); unless it is still the
   head, `document_finalize` refuses under the document's lock (409 "The document changed; reload and try
   again"). It writes the snapshot on that revision and makes the document final. Finalizing the revision
   that is already the finalized one changes nothing and notifies nobody, so a snapshot, once written, never
   changes.
3. There is no `GET /documents/{id}/revisions/{number}`: `GET /documents/{id}?revision=n` reads one
   revision (404 "Revision not found" for one that does not exist or was pruned), and the revisions list
   has no bodies.
4. The class's list is one row per document of the class's teams (id, kind, title, team, sprint, status,
   revisions, edited since, last update), for the class instructor and its TAs (403 "Only the instructor
   or a class TA can read the class's documents" for anyone else).
5. The sprint report's averages to date count this sprint and every sprint of the team that started
   before it, pooled: stories, then hours, over all their days. The release summary's backlog lists the
   unfinished stories of each sprint, sprints by start, then the backlog's stories, each list in board
   order. Seeds stay within the body limits: at most 30 key stories, at most 60 scenarios, a scenario's
   title cut to 120 characters (the story's key when its title is blank) and its steps to the whole
   criteria that fit in 2000 characters.
6. A save checks that every story its body names is on the team's board (422 "A story is not on this
   team's board"). Deleting takes the same roles as finalizing (403 "Only the Scrum Master or the Product
   Owner can delete a document"). A project's document given a sprint is 422 "This document belongs to the
   project, not to a sprint".
7. Saving (30 a minute) and finalizing (10 a minute) are rate-limited per signed-in user: a save stores up
   to 256 kB, and a finalize emails the team's TAs.
8. The in-app notification's `entity_id` is the document's id; the email links to
   `/app/projects/<project>/documents/<document>`.

**Amended 2026-11-17, after the branch review:**

1. **Every hand-in is kept.** `project_document_revisions` gains `finalized_at` and `finalized_by`, which
   `document_finalize` stamps with the snapshot on the revision it hands in. A revision that carries a
   snapshot answers it (`derived_frozen`) whichever hand-in is the document's latest; the revisions list marks
   every hand-in (`finalized`, `finalized_at`) without reading snapshots; pruning never deletes a revision
   with a snapshot. `document_finalize` answers NULL when it wrote nothing (the revision was finalized
   already, by a request that won the lock), and the API then tells nobody and records nothing.
2. **A document too long to store is refused, never a 500.** A body (create, save) or a snapshot (finalize)
   over 200,000 bytes of compact UTF-8 JSON answers "This document is too long" (422 for a body, 409 for a
   finalize), as does the database's size CHECK. The test report's derived sections hold each story its
   scenarios name once, `stories: {<id>: {key, title, acceptance_criteria} | {missing: true}}`, and each
   scenario lists its `story_ids`.
3. *(Superseded by the counting rules below.)* **A sprint report describes the sprint as it ended.**
   `sprint_burnup_days` gains `story_ids` and `done_story_ids` (nullable, no default; the same migration),
   which every board snapshot writes from the rows it reads for its totals; on a database without them the
   snapshot is saved without them. The report
   takes the sprint's stories and its completed ones from the last saved day on or before the sprint's end
   that recorded them, each shown as it is now (`missing` once deleted), and names that day (`as_of`); with
   no such day it falls back to the board now (`as_of: "now"`). The rates to date use the same rule for each
   sprint, and the burnup replays the task moves for the days nobody saved, as the board does.
4. Shrinking a class's sprint schedule refuses (409, "already uses Sprint k") when a sprint it would delete
   holds a document, as it does for a story.

**Amended 2026-11-17, the maintainer's counting rules** (this supersedes item 3 of the amendment above):

1. **Each saved burnup day records its sprint's stories with their numbers.** `sprint_burnup_days.stories`
   (jsonb, nullable, no default; `sprint_burnup_days_stories_valid` holds it to NULL or a JSON array) lists
   one `{id, done, hours, points}` per live story of the sprint that day, in board order: `done` by the
   documents' rule (a task, and every task done), `hours` the sum of its tasks' estimate hours (0 when none
   has one). It replaces `story_ids` and `done_story_ids`: the migration no longer adds them and drops them
   where an earlier text of it did. The board writes it with every snapshot it takes, from the rows it reads
   for its totals and with no round trip of its own; on a database without the column the day is saved
   without it. A story points edit still takes no snapshot.
2. **A sprint report reads the sprint's end record:** the last saved day on or before the sprint's last day
   that has `stories` (`as_of`, that day), else the board now (`as_of: "now"`).
3. **Stories.** `completed` and `not_completed` list the record's stories that still exist, each with its
   key and title as they are now and its points and hours from the record. A story deleted since is left
   out everywhere: no line, not counted. Without a record, the lines and numbers come from the board now.
4. **Hours count only completed stories.** `hours_completed` is the sum of the record's hours over the
   stories it marks done. An unfinished story adds nothing to its sprint, and its hours count in the sprint
   where it is completed. Without a record: the task hours of the stories completed now.
   `stories_completed`, the per-day rates and `to_date` use the same rule for every counted sprint, each
   from its own end record or the board now.
5. **After the sprint ended** (`after_sprint`, null without a record, empty while the sprint runs). Among
   the record's stories that still exist and are still in the sprint (a story moved to another sprint shows
   in that sprint's report): `stories`, those the record marks not done that are completed now (id, key,
   title, points, hours, as they are now); `tasks`, the tasks of those and of the record's done stories
   that are done now and were last moved to done after the sprint's last day at the school (id, story key,
   title, hours, `done_on`; a task with no recorded move to done is left out), by `done_on` and then story
   order, at most 100; `hours`, the hours of every such task. None of it enters the sprint's numbers or
   rates.
6. **The burnup is unchanged:** it counts every done task, so `hours_completed` can be below its last
   point. The page and the Markdown name the figure "Hours in completed stories", and both show an "After
   the sprint ended" section when `after_sprint` holds anything. Finalize freezes `after_sprint` with the
   other derived sections; the connector's import still rebuilds days without a record.

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

**Amended 2026-11-17** (while building PR 3):

1. The Documents tab lists each sprint's report, then the release summary and the test plan and report;
   the Release plan and sprint plan rows come with PRs 4 and 5. A made document opens from its row's
   first cell, and one not made yet has a Start button for a team member outside the preview.
2. The unsaved-changes guard holds in-app navigation by wrapping the router's navigator: the app's
   `BrowserRouter` is not a data router, so `useBlocker` is not available. The browser's leaving gets
   `beforeunload`; Back and Forward are not held. A navigation held when the page turns clean (a save
   landing under the dialog) is made.
3. The staff badge is on TA Meetings, where an instructor and a class TA see a card per team: "n of m
   handed in" counts the documents the team has made, and a team with none shows nothing.
4. "The sprint has not ended yet" is read from the API's `sprint.status` (completed from the day after
   the sprint's last day, at the school), so the page needs no zone of its own.
5. The story pickers read `GET /api/projects/{project_id}/documents/stories`: every live story of the
   team's board in board order (each sprint's, sprints by start, then the backlog's; a legacy archived
   story left out), each `{id, key, title, acceptance_criteria, sprint_id, sprint_name, completed}`.
   Members and class staff read it as they read the board (403 and 404 as the other document reads). It
   derives from the sprints, stories and tasks the documents already read and writes nothing: no burnup
   snapshot and no event, unlike the board's own read. The page reads it once for the document's own
   project, the first time an editor that picks stories opens for a team member, and keeps it; a save
   refused because a story left the board reads it again. No documents code reads the scrum board.
6. Download Markdown saves the file under the name in the response's `Content-Disposition`: the API
   client's `apiRequest` gains a `file` response type, and `getDocumentMarkdownFile` sits beside
   `getDocumentMarkdown`.
7. A hand-in older than the latest shows its date without a name: the API names only the latest
   finalizer.

**Amended 2026-11-17, after the branch review:**

1. The stories route (item 5) is PR 3's one backend change, with its client method
   (`getDocumentStories`) and catalog entry (`list_document_stories`).
2. Download Markdown and Copy give a document's latest hand-in, else its head, as the API renders it.
   When that is not the revision on screen, a note under them says which.
3. A save refused because a story left the board asks about every story it sent when the revision the
   edit began from is a hand-in (whose sections are frozen) or cannot be read, else about the ones the
   edit added.
4. Loading the revision being edited again (a finalize refused because someone saved first reloads it)
   keeps what was typed and not saved, with the revision it began from. A save's, its refetch's or a
   finalize's answer that lands after the page moved to another revision changes nothing on screen.
5. The revisions diff does not report a change of spacing alone. "Add a scenario for it" waits until
   the board's stories are read, since the scenario's steps are the story's criteria.

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
