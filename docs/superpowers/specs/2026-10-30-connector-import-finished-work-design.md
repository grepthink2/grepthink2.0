# Connector: import finished work as done, with a true burnup — design

Date: 2026-10-30. Status: draft for the maintainer. The open questions are at the end.

## Why

The import nudge (`2026-10-30-connector-import-nudge-design.md`) pushes teams that already run sprints
elsewhere to move their board into GrepThink. Mid-term those teams have finished sprints and done work. Today
the connector (`fill_board`, `app/mcp/controller.py`) can only add work as To do:

- tasks have no status on the way in;
- stories cannot join a sprint whose dates are past;
- even if they could, the sprint's burnup would be wrong. A past day takes its values from a saved snapshot
  (`sprint_burnup_days`) when there is one; only "completed" can be rebuilt from the move history
  (`task_moves`), and scope never is. So imported work would show as never done, or its scope line would sit at
  zero.

The maintainer chose to let the connector bring finished work in as done, with a burnup that reads as though
the team had used the board all along.

## Goals

1. `fill_board` takes a status for each task (`todo`, `in_progress`, `done`) and, for done work, the day it
   was finished (`done_on`).
2. Stories may join any sprint of the project, finished ones included, existing or new in the batch.
3. Each sprint that receives imported work shows a burnup as if the work had been there from the start:
   - scope flat from the sprint's first day;
   - completed rising on each task's `done_on`;
   - the cumulative chart's per-sprint values to match.
4. Nothing already on the board changes: no edits, moves or deletes of existing tasks. Merge only, as before.

## Non-goals

- Story status (stories have none; a story counts as done when its tasks are).
- Importing comments, dependencies, PR links or who moved what (an imported move is credited to the student
  who ran the import).
- Changing how the board's own moves and snapshots work.

## Design

### Input

- `NewTask` gains `status: "todo" | "in_progress" | "done"` (default `todo`) and `done_on: date | None`.
- Validation, in the same all-errors pass as today:
  - `done_on` only with `status = "done"`, and not after today (the school's zone).
  - A done task without `done_on` takes a default (open question 2) and a warning says so.
  - A `done_on` outside its story's sprint is moved to the nearest day inside the sprint, with a warning.
  - Stories may join completed sprints: the "planned or active only" rule goes for imports.
  - The class's rules stay: a new sprint fits the class's days and the class's sprint cap.

### The write (one transaction, `scrum_fill_board`)

- Tasks are inserted as now, at `todo`.
- Each task not at `todo` gets one `task_moves` row (`todo` → its status), `moved_by` = the student:
  - a done task's move is dated `done_on`, at noon in the school's zone, so it lands on that school day;
  - an in-progress task's move is dated now.

  The existing BEFORE INSERT trigger (`scrum_apply_task_move`) sets each task's status and `moved_at`, so done
  tasks look exactly as if the team had moved them that day.
- The function signature stays; the task objects carry `status` and `moved_at` (computed in Python, since the
  school's zone lives there).

### The burnup (after the write, best-effort like today's snapshot)

For each sprint that received imported work and has started (its first day is today or earlier):

- recompute its daily values for every day from its first day to the earlier of its last day and today;
- write them to `sprint_burnup_days`, both units (points and hours), with one upsert:
  - scope: the sprint's current scope, every day;
  - completed: rebuilt from `task_moves` per school day, the board's existing reconstruction
    (`_completed_by_day_from_moves`) run in both units.

This **replaces** that sprint's saved snapshots for those days (open question 1). A sprint that has not started
needs nothing: its chart begins when it does.

### The assistant's side

- `get_board_context` already lists sprints with their date-based status. Its description, and
  `fill_board`'s, change:
  - map stories to the class's existing sprints first, finished ones included;
  - import done work as done with the day it finished when the source has it;
  - ask the student when the source doesn't say.
- The nudge's gathering prompt (`features/connector/prompts.ts`) asks for the same: each task's status, and the
  day finished work was done.

### Events

`board_agent_fill` meta gains `done` and `in_progress` counts.

## Testing

- **Controller:**
  - status and `done_on` validation, defaults and clamping warnings;
  - completed sprints accepted;
  - the payload carries status and `moved_at`;
  - burnup rows rewritten for started sprints only, in both units, flat scope, completed by day;
  - round-trip budget.
- **SQL on DEV** (rolled back): moves inserted, task statuses and `moved_at` set by the trigger, keys unchanged,
  a bad row still rolls back everything.
- **End to end on DEV:** import a finished sprint and an active one and read both charts through
  `GET /scrum/board`; clean up.

## Builder's notes (from the read-through)

- **The chart cannot simply keep its snapshots for a finished sprint.** The import day falls after the sprint
  ends, so there is no import-day jump. Scope carries forward from the sprint's saved snapshots, or sits at 0
  without any, and completed is rebuilt only on days with no snapshot. Keeping the snapshots gives a broken chart
  (scope at 0, or completed above scope), not an honest one. The real choice is to rewrite, or to limit when the
  rewrite may happen.
- **Snapshots exist after a sprint's last day** (one per day the board is opened), and the cumulative chart takes
  a sprint's latest row. A rewrite replaces those rows too.
- **Stories have no status, and the burnup counts only task estimates.** A done card with no subtasks adds nothing
  unless it arrives as a story with at least one task.
- **DEV lacks two migrations already on `beta`** (`2026-10-22_class_sprint_schedule.sql`,
  `2026-10-22_burnup_hours.sql`), so the board and the connector fail on DEV until they are applied. Nothing in
  this design can be tested there before that.
- **`scrum_fill_board` is still pending on PROD.** Since its signature stays the same, a backend deployed before the
  new body is applied would quietly import done tasks as To do: the code must check that the function supports
  statuses, and refuse otherwise.

## Open for the maintainer

1. **Rewriting a sprint's chart history.** Imported work makes a started sprint's chart read as planned from
   day one: scope flat, completed rising on the done days. That overwrites the sprint's saved daily snapshots.
   For a team with 3 stories or fewer, those snapshots describe a nearly empty board, but they are the real
   record. The alternative keeps them: the imported scope then shows as a jump on the import day, and past days
   stay at whatever the saved snapshots say.
2. **A done task with no date.** Its default could be the sprint's last day (or today, if the sprint is still
   running), or the import is refused until the assistant asks the student.
3. **Where the nudge ships.** The nudge PR (`feat/connector-import-nudge`, ready) could go out now with a prompt
   that imports open work only, and switch to this once it lands. Or it waits for this.
