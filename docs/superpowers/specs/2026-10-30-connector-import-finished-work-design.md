# Connector: import finished work as done, with a true burnup — design

Date: 2026-10-30, decisions 2026-11-02 and 2026-11-05. Status: agreed with the maintainer, and built, in the pull request
that adds this file. The import nudge at the end is built in the pull request after it, with its copy and placement
still for the maintainer to check.

## Why

The import nudge (planned at the end of this spec) pushes teams that already run sprints elsewhere to move their
board into GrepThink. Mid-term those teams have finished sprints and done work. Today the connector (`fill_board`,
`app/mcp/controller.py`) can only add work as To do:

- tasks have no status on the way in;
- stories cannot join a sprint whose dates are past;
- even if they could, the sprint's burnup would be wrong. A past day takes its values from a saved snapshot
  (`sprint_burnup_days`) when there is one; only "completed" can be rebuilt from the move history
  (`task_moves`), and scope never is. So imported work would show as never done, or its scope line would sit at
  zero.

The maintainer chose to let the connector bring finished work in as done, with a burnup that reads as though
the team had used the board all along, and that says it holds imported work.

## Goals

1. `fill_board` takes a status for each task (`todo`, `in_progress`, `done`) and, for done work, the day it
   was finished (`done_on`).
2. While the move-in window is open, stories may join any sprint of the project, finished ones included, existing
   or new in the batch.
3. Each started sprint that receives imported work shows a burnup as if the work had been there from the start:
   - scope flat from the sprint's first day;
   - completed rising on each task's `done_on`;
   - the cumulative chart's per-sprint values to match.
4. No existing story or task is edited, moved or deleted: merge only, as before. The one thing that changes is the
   receiving sprint's chart: its saved rows are replaced, so scope from stories already there also reads as flat.
5. A rebuilt chart says so.

## Non-goals

- Story status (stories have none; a story counts as done when its tasks are).
- Importing comments, dependencies, PR links or who moved what (an imported move is credited to the student
  who ran the import).
- Changing how the board's own moves and snapshots work.

## The move-in window

`user_stories` gains `imported_at timestamptz` (NULL for a story made any other way).

- **Open** while the project holds 3 live stories or fewer with `imported_at` NULL. It is checked once, at the start
  of each `fill_board` call, so imported stories never close it and a move-in can take several batches (the cap is
  60 stories per call).
- **While it is open,** every story `fill_board` writes gets `imported_at`, whatever its status or sprint. The order
  of a team's batches therefore doesn't matter: open work sent first leaves the window open for done work.
- **Once it is closed,** `fill_board` refuses a task that isn't To do and a story in a finished sprint, and says
  why. Stories it still accepts get no `imported_at`, and charts are not rebuilt.
- **Accepted consequence:** a team that only ever adds stories through the connector stays in the window, so it could
  backdate later. The chart's note still shows.

## Design

### Input

- `NewTask` gains `status: "todo" | "in_progress" | "done"` (default `todo`) and `done_on: date | None`.
- Validation, in the same all-errors pass as today:
  - `done_on` only with `status = "done"`, and never after today (the school's zone).
  - A done task in the backlog, or in a sprint that hasn't started, is refused, and the error names the fix.
  - A `done_on` outside its story's sprint moves to the nearest day inside the sprint, with a warning that names the
    task. This costs one line in the checker, as a refusal would, and saves the assistant a second call.
  - A done task with no `done_on` takes its sprint's last day, or today if the sprint is still running, with a
    warning that names the task.
  - A To do or In progress task in a finished sprint is accepted, with a warning: it adds scope that stays open.
  - A story with no tasks gets a warning, because the burnup counts only task estimates.
  - The class's rules stay: a new sprint fits the class's days and the class's sprint cap.

### The write (one transaction, `scrum_fill_board`)

The function gains three arguments, `p_burnup jsonb`, `p_expected_story_seq integer` and `p_expected_task_seq integer`,
and each story object gains `imported_at`:

- Tasks are inserted as now, at `todo`.
- Each task not at `todo` gets one `task_moves` row (`todo` to its status), `moved_by` = the student. The existing
  BEFORE INSERT trigger (`scrum_apply_task_move`) sets the task's status and `moved_at`, so done tasks look exactly as
  if the team had moved them that day. Python computes `moved_at`, since the school's zone lives there:
  - a done task: noon at the school on `done_on`, or now if that is earlier, so no move is dated in the future;
  - an in-progress task: now.
- For each sprint named in `p_burnup` (`sprint_id`, or `sprint_ref` for a new one): delete its saved
  `sprint_burnup_days` rows and insert the given ones. A failure rolls back the whole batch, and the window is not
  closed by a half-finished import. Like the rest of the function, this trusts its caller.
- With rows to write, the expected counters must match `scrum_counters` once the function holds that row's lock, or it
  raises 23505. The rows are computed from a read made before the transaction, so without this two overlapping imports
  into one sprint (an assistant's parallel tool calls, or two teammates) would overwrite each other's chart: the later
  batch's rows would leave out the earlier batch's work, and a finished sprint's chart would stay wrong. `fill_board`
  turns the conflict into a refusal that tells the assistant to read the board again.

**The new arguments make this a new signature, which removes the silent-downgrade risk.** The backend calls by argument
name, so a new backend against a database without the new function fails loudly (`PGRST202`, confirmed on DEV) instead
of importing done tasks as To do. No separate version check is needed.

### The burnup rows (computed before the write)

While the window is open, for each sprint that receives stories and has started (its first day is today or earlier),
`fill_board` builds the rows it passes as `p_burnup`:

- it reads the project's counters, then the sprint's live stories with their tasks and those tasks' moves;
- for every day from the sprint's first day to the earlier of its last day and today, and for today if the sprint has
  ended, in both units (points and hours):
  - scope: the sprint's scope after the batch, every day;
  - completed: replayed from the existing moves plus the batch's moves. The replay in
    `_completed_by_day_from_moves` moves into `app/scrum/burnup.py` as a pure function, and the board and the import
    both call it.

Replacing the rows also removes those dated after the sprint's last day. The row dated today takes their place, so the
cumulative chart, which reads a sprint's latest row, gets the final values, work finished on the board since the sprint
ended included. The sprint's own chart stops at its last day. A task moved on the board between the read and the write can leave today's
row stale until the next snapshot corrects it. Past days can't be affected, because a move on the board is dated now and
anything added moves the counters.

A sprint that has not started gets no rows: its chart begins when it does. Outside the window `fill_board` keeps
today's best-effort snapshot.

### The label

The data is per story; what people see is one note. The board response gains `burnup.sprint.imported` and
`burnup.cumulative.imported`, computed from stories already loaded:

- a sprint's chart shows **"Includes imported work"** when one of its stories has an `imported_at` on or after the
  sprint's first day (the school's day), which is exactly the set of charts that were rebuilt;
- the cumulative chart shows the same note when any sprint qualifies.

`BurnupChart` gains an optional `note` prop. Story cards stay as they are.

### The assistant's side

- `get_board_context` adds `import_window_open`, and still lists sprints with their date-based status.
- Its description and `fill_board`'s change, for when the window is open:
  - map stories to the class's existing sprints first, finished ones included;
  - put each done story in the sprint whose dates contain its done day;
  - give each card one story with at least one task, carrying its points, hours and status;
  - ask the student when the source doesn't say when work was finished.

### Events

`board_agent_fill` meta gains `done`, `in_progress` and `imported` counts.

## Applying it

One new migration, `2026-11/2026-11-05_scrum_import.sql`, adds the column and the new function, labelled `needs-prod-sql`. Apply it on DEV and then
on PROD before the code deploys. `CREATE OR REPLACE` with new arguments leaves the old four-argument function in place,
so the deployed backend keeps working; drop the old one once the new code is live.

## Testing

- **Controller:**
  - status and `done_on` validation, defaults, nearest-day moves and warnings;
  - the window: open and closed, imported stories not counted, a second batch accepted;
  - finished sprints accepted in the window and refused past it, unfinished work there warned about;
  - the payload carries `imported_at`, status and `moved_at`, with no move dated in the future;
  - `p_burnup` covers started sprints only, in both units, flat scope, completed by day, new sprints by ref;
  - the expected counters are sent, and a conflict becomes a refusal the assistant can act on;
  - the label on rebuilt charts only;
  - round-trip budget.
- **SQL on DEV** (rolled back, reviewed on its own as AGENTS.md asks for SQL functions): moves inserted, task statuses
  and `moved_at` set by the trigger, keys unchanged, burnup rows replaced, moved counters refused, and a bad row
  rolling back everything including the burnup rows.
- **End to end on DEV:** import a finished sprint and an active one, read both charts through `GET /scrum/board`, send a
  second batch, then clean up.

## Builder's notes (from the read-through)

- **The chart cannot simply keep its snapshots for a finished sprint.** The import day falls after the sprint
  ends, so there is no import-day jump. Scope carries forward from the sprint's saved snapshots, or sits at 0
  without any, and completed is rebuilt only on days with no snapshot. Keeping the snapshots gives a broken chart
  (scope at 0, or completed above scope), not an honest one.
- **Snapshots exist after a sprint's last day** (one per day the board is opened), and the cumulative chart takes
  a sprint's latest row.
- **Stories have no status, and the burnup counts only task estimates.** A done card with no subtasks adds nothing
  unless it arrives as a story with at least one task.

## Decided by the maintainer

2026-11-02:

1. Done work and backdating are a one-time move-in, limited to the window above. Past it, `fill_board` refuses a task
   that isn't To do and a story in a finished sprint, and says why.
2. Done work goes into the sprint that holds its done day, and is refused in the backlog or in a sprint that hasn't
   started.
3. Every story gets at least one task, and the connector warns about a story with none.
4. A done task with no date takes its sprint's last day, or today if the sprint is still running, with a warning.
5. The two migrations then missing on DEV were applied there. PROD already had them, along with
   `scrum_fill_board` and the OAuth tables (confirmed from its catalog on 2026-11-05).

2026-11-05:

6. Imported work is labelled. The data is per story, because the window has to tell imported stories from the rest, and
   the visible label stays one note.
7. Imported stories don't count toward the window's 3, so a move-in can take several batches.
8. The burnup rows are rewritten in the same transaction as the batch.
9. Unfinished work may go into a finished sprint during the move-in, with a warning.
10. A `done_on` outside its sprint moves to the nearest day inside it, with a warning.
11. The import nudge is planned before the next release (below).

Decided by the builder, for the maintainer to veto:

- Every story written in the window is marked, not only those with done work.
- The window has no time limit.
- No move is dated in the future.
- With rows to write, `scrum_fill_board` refuses a batch if the board's counters moved since they were read, and the
  assistant is told to read the board again.
- An ended sprint keeps a row dated today, so the cumulative chart counts work finished on the board since it ended.
- The consent page no longer says the app "can't change or delete anything already there": it says stories and tasks,
  and that moving a board in rebuilds the burnup charts of the sprints it adds to.

## The import nudge: plan

The nudge's earlier draft (`2026-10-30-connector-import-nudge-design.md`) and its prompt file were never committed, and
no branch or session holds them, so this section replaces them. Its copy and placement are proposals until the
maintainer has seen them.

**What it is.** A dismissible notice on the board, for team members, when the connector is ready and the window is
open. It invites a team that already runs sprints elsewhere to bring its board in, and it opens the existing "Connect an
AI assistant" popover.

**What it needs:**

1. The board response gains `connector_ready` (`PUBLIC_API_URL` is set and the MCP app started) and
   `import_window_open`, so the nudge hides itself when either is false. It also gains `has_imported_stories`, which
   hides the nudge once a team has brought anything in, because imported stories leave the window open.
2. A notice on `ScrumBoardPage`, using the kit's `Alert`, dismissed per browser and per project.
3. `features/connector/prompts.ts`: a copyable prompt that asks the student's assistant to gather the team's sprints,
   stories and tasks from its source, with each task's status and estimate and the day finished work was done. The
   estimate matters: the burnup counts only task estimates, and an import without them draws a flat chart that
   estimating later doesn't redraw.
4. Tests for when it shows and hides, and for the dismissal.

**Order, one pull request each onto `beta`:**

1. The import above, with its migration applied on DEV and PROD.
2. The nudge.
3. `release/<version>` with the release notes.

**The nudge must not ship before the import.** A story added before `imported_at` exists counts as hand-made, so a team
that followed an early nudge with its open work could close its own window, and its finished work would then be refused.

**The next release is not held for this.** The connector works without either piece: if a release has to go first, it
goes without them, and nothing about the nudge shows.

## The Home invitation

Decided by the maintainer on 2026-11-07: a modal on the student Home that opens by itself for students on a team with
fewer than 3 stories, whether or not the team has imported. It opens on every visit, to push adoption.

**What it is.** The look of What's New (the kit's `Modal`, a title, the team's name as the subtitle, the × and no
footer), though What's New itself only ever opens from its menu. The title and first paragraph are the board notice's
own, from one place, so the two can't drift. Two steps follow: "Add GrepThink to your assistant", with the connector's
address and where Claude and ChatGPT take it, then "Paste this prompt into a chat", with the move-in prompt to copy. It
closes with the ×, Esc or the scrim.

**Who sees it.** All of these must hold:

| Rule | Why |
|---|---|
| The caller's role in the selected class is `student` | TAs share the student Home; the account role is never used for a class decision |
| Not in "View class as student" | An instructor's preview has no team to bring in |
| The selected class isn't complete | Moving a board into a finished class is pointless |
| The student is on a team in the selected class | The team on Home's team card: the first, or the one they pick |
| The summary says `connector_ready` | Otherwise it sends students to a connector that answers 503 |
| The summary's `story_count` is under 3 | The maintainer's rule |
| This visit hasn't settled the team | See "How often" |
| No other dialog is up when the answer arrives | It never opens over or under Settings, Join class, the search palette or the requests; the next Home load asks again |

**What counts as a story.** Every story of the project with `archived_at` NULL: in a sprint or the backlog, imported or
not. The import window allows 3 stories that aren't imported, so fewer than 3 in all always leaves it open, and the
promise about finished work holds whenever the modal shows. A team with exactly 3 hand-made stories gets the board's
notice and no modal.

**How often.** Every visit, until the team has 3 stories:

- A visit is a browser tab's session. A new tab or window starts one, and a reload doesn't. A duplicated tab copies
  `sessionStorage`, so it starts with what the first tab settled.
- Each Home load asks until the visit settles the team. Closing the invitation settles it, and it opens again on the
  next visit. A board with 3 or more stories settles it with no modal, and the next visit asks again, so a team that
  deletes back under 3 is invited again.
- Nothing else settles it. A failed read, a connector that isn't ready, another dialog in the way, or leaving Home
  without closing the invitation (Back, a search result, a reload) all leave the team to the next Home load.
- An open invitation follows the latest answer: a later read that finds 3 stories closes it, and an answer that arrives
  after the student closed it doesn't reopen it. A team that leaves Home's team card and comes back waits for a fresh
  answer.
- What a visit has settled is kept in `sessionStorage`. When storage refuses, the page's own record covers until a
  reload.

**When "after login" is.** Whenever Home loads. Sessions persist, so a student who never signs out sees it on their
next visit.

**Where the numbers come from.** `GET /api/projects/{id}/scrum/summary` gains `story_count` and `connector_ready`. The
summary is a pure read; the board's own read records a `board_viewed` event and takes a burnup snapshot, which would
count every Home visit as a board view.

**The board's notice is unchanged.** It keeps its own rule and its own dismissal. Closing the modal doesn't dismiss the
notice, and an earlier dismissal of the notice doesn't suppress the modal.
