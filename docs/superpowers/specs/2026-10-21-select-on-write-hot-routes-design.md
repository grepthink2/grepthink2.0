# Fewer Round Trips on Four Hot Routes (select-on-write) — Design Spec

**Date:** 2026-10-21
**Branch:** `perf/select-on-write`, on `origin/beta` `2633e901`. Code references are to `7848d920`; none of
the files they cite changed between the two.
**Status:** Approved in conversation (maintainer, 2026-10-21), with D7 changed: the response shapes move
in this batch.

## The ask (maintainer, 2026-10-20)

"Do #3 - 2.33 supabase-py select-on write on hot paths / scope it out first and see which routes really
benefit from it." After the scoping, the maintainer chose "select-on-write on the four hot routes (send
message, move task, TSR entry edit, comments), the test-double support, and the same-route cheap wins".

## Background

supabase-py 2.33 (postgrest-py 2.33) returns a select builder from `insert`, `upsert`, `update` and
`delete`. A `.select("columns, alias:table!fk(columns)")` chained on a write makes PostgREST answer with
the written rows shaped by that select, related rows embedded, in the same request. Every `.execute()`
is one round trip to PostgREST (`app/core/db.py:1-10`), so a follow-up read that the write's own response
can carry is a round trip saved. Since 2026-10-17 the backend runs in Vercel's sfo1, next to PROD's
database, so a round trip is a short same-region request; it has not been measured.

The scoping read every write in the backend (about 145). Most write routes already answer with the row
their write returns, and their other reads are authorization reads that must come before the write. Four
frequent routes have a read after the write that the write's response can carry; they are this batch.

### What was checked on DEV (2026-10-20; no row changed)

1. A select chained on a write returns aliased and `!fk`-hinted embeds: an update of a `classes` row to
   the status it already had returned `institution:institutions(name)` and
   `profiles!classes_created_by_fkey(id)`. `count="exact"` survives the select, and `returning="minimal"`
   followed by a select returns rows.
2. **Embedded rows show the database as it was before the write.** PostgREST sends a write and its select
   as one statement (the write inside `WITH … RETURNING`, the embeds joined to its rows), and Postgres runs
   one statement on one snapshot. A probe with that statement shape, rolled back: inserting a `task_moves`
   row for a task in `in_progress` moved the task to `done` through the `task_moves_apply` trigger, and the
   embedded `tasks.status` read `in_progress`.
3. A write that matches nothing with `.single()` raises PGRST116, which `get_client()` turns into a
   `DatabaseError` (a 500). With `.maybe_single()` the call returns `None`.
4. An unknown embed (PGRST200) refuses the whole write, not just a later read.
5. These foreign keys exist on DEV under these names: `messages_sender_id_fkey`,
   `task_moves_moved_by_fkey`, `task_moves_task_id_fkey`, `tasks_story_id_fkey`,
   `scrum_comments_author_id_fkey`, `TSRs_evaluator_id_fkey`, `TSRs_evaluatee_id_fkey`,
   `TSRs_assignment_id_fkey`, `assignments_class_id_fkey`.

## Decisions (mine, flagged)

- **D1. Scope.** Select-on-write on four routes: `POST /api/messages`,
  `POST /api/scrum/tasks/{task_id}/move`, `PATCH /api/assignments/{assignment_id}/tsrs/{tsr_id}` and
  `POST /api/scrum/{stories|tasks}/{id}/comments`. Five fixes on the same routes need no select-on-write
  and come along:
  - (a) sending a message reuses the participant ids it has already read;
  - (b) the burnup totals come from one read;
  - (c) marking a notification read is one update that also checks the owner;
  - (d) the notification list and its unread count run in one wave;
  - (e) a TSR edit fetches the assignment's window in its first read.

  Not in this batch:
  - the rarely run folds the scoping found (the staffing form submission, join requests, saving a
    profile, sign-up, school-email verification, editing an assignment);
  - batching the per-recipient notification writes of a team message;
  - the writes `GET /api/notifications` makes, which its list read must see.
- **D2. An embed on a write reads only what the write and its triggers leave alone.** Every fold below
  embeds `profiles`, or a story's sprint, and neither changes in these requests. The move never reads the
  task's status from its embed (DEV check 2). Two triggers on the written tables change other tables:
  `task_moves_apply` (updates `tasks`) and `messages_bump_last_message` (updates `conversations`). No fold
  embeds what they change. The third, `tsrs_set_updated_at`, changes only the written row, and the
  response shows that row's own columns after the write.
- **D3. Every embed on a write names its foreign key** (`profiles!messages_sender_id_fkey(…)`), even where
  only one key joins the two tables today. A broken embed now refuses the write (DEV check 4), and a
  second foreign key between the same tables would make an unnamed one ambiguous (PGRST201). Read embeds
  keep the codebase's style: a hint only where two keys join the same tables.
- **D4. No `.single()` or `.maybe_single()` after a write.** The write's list is read as today
  (`res.data[0]`, an empty list leading to today's 404 or 500), because a zero-row `.single()` would turn
  a 404 into a 500 (DEV check 3).
- **D5. Embed keys never leave the controller.** Each fold pops its embeds off the row after reading
  them (`sender`, `mover`, `task`, `author`, `evaluator`, `evaluatee`). Response models and every other
  reader then see exactly the keys they see today.
- **D6. Names fall back as they do today.** Scrum names go through `_display_name` ("Unknown"). The
  message notification's title uses `profile_display_name(…) or "Someone"`. TSR entries go through
  `profile_display_name` with an empty profile when one is missing.
- **D7. The three response shapes move in this batch (the maintainer's call).** The move, comment and
  TSR-edit routes still answer `{message, <resource>}` (`app/scrum/views.py:166`, `:200`, `:214`;
  `app/assignments/views.py:79`), and the repo rule moves a touched endpoint to the current shape in the
  same pull request, so they move here. The two Vercel projects deploy separately, and the web client never reloads
  itself after a release, so a tab opened before the release keeps the old bundle. On a bare task the
  board's `const { task } = await api.moveScrumTask(…)` (`frontend/src/features/scrum/hooks/useScrumBoard.ts:187`)
  gets `undefined`, and `task.status` then throws while the board re-renders, which drops the app to its
  one error boundary (`frontend/src/App.tsx:76`). The TSR page and the comment thread destructure the same way (`TSRS.tsx:309`,
  `CommentThread.tsx:56`). The maintainer accepted that, since traffic is light: such a tab fails on those
  three actions until it is reloaded. So the three routes answer the resource itself (section Response
  shapes), and the web client's three methods accept either shape and return the resource, so the frontend
  can deploy before the backend without breaking.
- **D8. The test double comes first.** `FakeSupabase` learns what DEV checks 1–4 showed (section Test
  double) before any fold is written, so each fold's test sees the shape PostgREST returns, including the
  pre-write snapshot.
- **D9. Every changed route pins its new count.** A budget assertion per route (section Round trips)
  stops a later edit from quietly bringing a read back.

## Backend

### Sending a message — `app/messages/controller.py`, `app/notifications/controller.py`

Today a reply in a direct message makes 10 executes, and a message in a team channel with R recipients
makes 5 + 3R. Two of those are re-reads:
- `send_message` reads the participants again (`:199`) after `_require_participant` has read them (`:302`).
- `notify_new_message` reads the sender's profile once per recipient
  (`app/notifications/controller.py:520`).

1. `_require_participant` (`:282`) returns `(conv, participant_ids)`, the ids its fan-out already read. The
   three callers that ignore its result (`:333`, `:371`, `:394`) stay as they are. `send_message` (`:198`)
   unpacks both and drops the `_participant_ids` call (`:199`).
2. The insert (`:224-234`) selects the row's columns and the sender:

   ```python
   client.table("messages")
   .insert({"conversation_id": conversation_id, "sender_id": sender_id, "body": body})
   .select(
       "id, conversation_id, sender_id, body, created_at, "
       "sender:profiles!messages_sender_id_fkey(first_name, last_name, email)"
   )
   .execute()
   ```

   Those five columns are all of `messages`' columns, so `message_row` keeps today's keys once `sender` is
   popped (D5). `sender_name = profile_display_name(sender)`.
3. `notify_recipients` (`:139`) and `notify_new_message` (`notifications/controller.py:509`) take
   `sender_name: str | None` in place of `sender_id`, which they used only for that profile read. The title
   becomes `f"New message from {sender_name or 'Someone'}"`.

After: 8 for a reply in a direct message, 4 + 2R for a team channel. The insert's AFTER trigger updates
`conversations`, which nothing embeds (D2).

### Moving a task — `app/scrum/controller.py:742-782`

Today a move from To do to Done, for a task in a sprint with no dependencies, makes 9 executes, pinned
`== 9` (`tests/test_scrum_moves.py:132`). They are: the task, the writer check, the dependency rows, the
insert, the mover's name (`:777`, `_name_for`), the story (`:779`, of which only `sprint_id` is used),
and the burnup's two reads and its upsert.

1. The insert selects the move, the mover, and the task's story:

   ```python
   client.table("task_moves")
   .insert({"task_id": str(task_id), "to_status": to_status, "moved_by": str(user_id)})
   .select(
       "*, mover:profiles!task_moves_moved_by_fkey(first_name, last_name, email), "
       "task:tasks!task_moves_task_id_fkey(story:user_stories!tasks_story_id_fkey(sprint_id))"
   )
   .execute()
   ```

   `move = res.data[0]`, then pop `mover` and `task` (D5). `moved_by_name = _display_name(mover)`, and the
   sprint is the embedded task's `story.sprint_id`.
2. The embedded task is the version from before the move (DEV check 2). Only its story's sprint is read,
   and a move never changes it (D2). The task in the response is built as today: the task read at `:746`
   plus the move's `to_status`, `moved_by` and `moved_at`.
3. This path no longer calls `_name_for` or `_get_story_or_404`. The no-op branch (`:756-760`, a task
   already in that column) is unchanged.

After: 7, or 6 with the burnup change below.

### Burnup totals in one read — `app/scrum/controller.py:665-684`

`_live_burnup_totals` reads the sprint's live stories, then their done tasks. One read instead:

```python
stories = (
    client.table("user_stories")
    .select("id, points, tasks(points, status)")
    .eq("sprint_id", str(sprint_id))
    .is_("archived_at", "null")
    .execute()
).data or []
done = [t for s in stories for t in s.get("tasks") or [] if t.get("status") == "done"]
return _totals(stories, done)
```

`tasks(…)` follows `tasks_story_id_fkey`, the only key between the two tables. It is a separate read
after the write, so it sees the move. It saves one round trip on every write that snapshots the burnup
without totals: the move (`:781`), creating a story (`:280`), updating a story (`:313`) and creating a
task (`:351`). The board passes its own totals (`:998`) and is unchanged.

### Posting a comment — `app/scrum/controller.py:1247-1268`

Today a team member's comment without a mention makes 4 executes: the parent, `_board_access`, the
insert, and the author's name (`:1268`). With a mention, `_fanout_mentions` reads that name once more
(`:1228`).

1. The insert selects the comment and its author:
   `.insert(row).select("*, author:profiles!scrum_comments_author_id_fkey(first_name, last_name, email)")`.
   Pop `author` (D5); `author_name = _display_name(author)`.
2. `_fanout_mentions` (`:1186`) takes `author_name` and stops reading it (`:1228`).
3. The answer is `{**row, "author_name": author_name}`, as today.

After: 3 without a mention; with a mention, 2 fewer than today.

### Editing a TSR entry — `app/assignments/controller.py:597-718`

Today an evaluator's edit makes 5 executes (pinned `<= 5`, `tests/test_assignments.py:296`) and an
instructor's 4 (`<= 4`, `:304`). They are:
- the TSR with its project and class (`:628-637`);
- the assignment's window (`:677-686`, for the evaluator only);
- the update (`:688`);
- the two people's profiles (`:692`);
- the event (`:694`).

1. The first read also embeds the assignment's window:
   `"id, evaluator_id, evaluatee_id, project_id, assignment_id, projects(class_id, classes(created_by)), "`
   `"assignment:assignments(id, class_id, open_date, due_at, accept_until, classes(institution_id))"`.
   The column list is `WINDOW_COLUMNS` (`:31`), spelled out here. It is a read, and `TSRs_assignment_id_fkey`
   is the only key between the two tables, so it carries no hint (D3).
   - The evaluator's window check reads `tsr["assignment"]` where it reads the separate result today. An
     empty embed is still 404 "Assignment not found" (`:684`).
   - The check stays where it is, after the assignment-id match (`:640-642`) and the empty-update 400, so
     the error order is unchanged.
2. The update selects its columns and both people:

   ```python
   client.table("TSRs")
   .update(updates)
   .eq("id", str(tsr_id))
   .select(
       f"{_TSR_COLUMNS}, "
       f"evaluator:profiles!TSRs_evaluator_id_fkey({PROFILE_SELECT}), "
       f"evaluatee:profiles!TSRs_evaluatee_id_fkey({PROFILE_SELECT})"
   )
   .execute()
   ```

   - `_TSR_COLUMNS` (`:195-199`) holds every column `_serialize_tsr_entry` and the event read.
   - `profile_map` is built from the two popped embeds (`{p["id"]: p for p in (evaluator, evaluatee) if p}`)
     instead of `_profiles_by_id` (`:692`). A self-review gives one entry.

After: 3 for both. The TSR page sends one edit per teammate in parallel
(`frontend/src/features/app/components/TSRS/TSRS.tsx:303-314`), so a re-submit waits on the slowest of
those requests, each now three round trips instead of five.

### Notifications — `app/notifications/controller.py`

1. **Marking one read** (`:693-710`). Today it reads the notification by id and owner, then updates it
   with the same filters. One update that checks the owner instead:

   ```python
   res = (
       _client()
       .table("notifications")
       .update({"read_at": _now_iso()})
       .eq("id", notification_id)
       .eq("user_id", user_id)
       .select("id")
       .execute()
   )
   if not res.data:
       raise HTTPException(status_code=404, detail="Notification not found")
   ```

   - This also fixes a 500. For an id that matches nothing (a reminder deleted since the list loaded,
     another user's id), `maybe_single()` returns `None` in supabase-py 2.x, so `res.data` (`:703`) raises
     `AttributeError`. No test covers that today.
   - An already-read notification is stamped again, as today.
   - 2 executes become 1.
2. **The list** (`:662-690`). The list read (`:667-674`) and the unread count (`:677-683`) don't depend on
   each other, so they run as one `fan_out` wave, after the two `ensure_*` helpers whose writes both must
   see. The executes are unchanged, and every load and realtime refetch waits for one wave fewer.
3. **`_get_profile`** (`:237-246`) has the same `None` trap: `return (res.data if res else None) or {}`.
   `GET /api/notifications` reaches it through `ensure_profile_completion_notification` (`:265`), which
   already handles an empty profile.

### Test double — `tests/fake_supabase.py`, `tests/scrum_support.py`

What PostgREST does that the fake must do:

1. A select chained on a write shapes the written rows: columns are projected and embeds attached through
   `_embed`, with the same relation registry. An unregistered embed raises, as it does for reads.
2. Embeds on a write resolve against the store as it was before the write: a copy taken in `execute()`
   before the write and before any emulated trigger runs. The written row's own columns are post-write.
   `_embed` takes the store it reads embedded rows from (by default the live store), and nested embeds use
   the same copy.
3. `select()` after a write keeps the write's `count`, forces representation (also after
   `returning="minimal"`), and refuses `count=` and `head=` with a `TypeError`. postgrest-py's write
   builder's `select(*columns)` takes neither.
4. `.single()` after a write raises unless the write returned exactly one row. `.maybe_single()` returns
   `None` for no row and raises for several.
5. A write with no select chained behaves as today: full rows, with `returning="minimal"` honoured by
   `update` only. No existing test changes for it.
6. Triggers: `FakeSupabase(triggers={("task_moves", "insert"): fn})`. `fn(db, row)` runs once per row
   inside `execute()`, after the copy and before the row is stored, like a BEFORE ROW trigger. `ScrumFake`
   moves its move emulation into such a trigger. Today that emulation runs when `insert()` is called
   (`scrum_support.py:60-82`), before any copy could be taken. After the move, a test's embedded task shows
   the status from before the move, as on DEV.
7. `tests/test_fake_supabase.py` covers each of 1–6.

The tests these folds touch register these relations:

| Key | Value |
|---|---|
| `("messages", "profiles!messages_sender_id_fkey")` | `("sender_id", "id", False)` |
| `("task_moves", "profiles!task_moves_moved_by_fkey")` | `("moved_by", "id", False)` |
| `("task_moves", "tasks!task_moves_task_id_fkey")` | `("task_id", "id", False)` |
| `("tasks", "user_stories!tasks_story_id_fkey")` | `("story_id", "id", False)` |
| `("user_stories", "tasks")` | `("id", "story_id", True)` |
| `("scrum_comments", "profiles!scrum_comments_author_id_fkey")` | `("author_id", "id", False)` |
| `("TSRs", "profiles!TSRs_evaluator_id_fkey")` | `("evaluator_id", "id", False)` |
| `("TSRs", "profiles!TSRs_evaluatee_id_fkey")` | `("evaluatee_id", "id", False)` |
| `("TSRs", "assignments")` | `("assignment_id", "id", False)` |
| `("assignments", "classes")` | `("class_id", "id", False)` |

The four scrum keys go in `scrum_support.RELATIONS`. `tests/test_messages_send.py` stubs the insert chain
with `MagicMock` (`:29`, `:83`, `:156`), and those stubs gain the `.select` link.

## Web client (D7)

- **The methods.** `moveScrumTask` and `createScrumComment` (`frontend/src/lib/api/scrum.ts:99-104`,
  `:125-130`) and `updateAssignmentTsr` (`frontend/src/lib/api/assignments.ts:65-77`) answer the resource:
  `ApiScrumTask`, `ApiScrumComment` and `ApiAssignmentTsrEntry`, whichever shape the backend sends.

  ```ts
  moveScrumTask: async (taskId: string, toStatus: ApiBoardStatus): Promise<ApiScrumTask> => {
    const res = await apiRequest<ApiScrumTask | { message: string; task: ApiScrumTask }>(
      `/api/scrum/tasks/${taskId}/move`,
      { method: 'POST', body: JSON.stringify({ to_status: toStatus }) },
    );
    // An older backend answers {message, task}.
    return 'task' in res ? res.task : res;
  },
  ```

  None of the three resources has a field named like its wrapper's (`task`, `comment`, `tsr`), so the
  check is unambiguous.
- **The callers** take the resource: `useScrumBoard.ts:187`, `CommentThread.tsx:56`, `TSRS.tsx:309`.
- **The tests.** Mocks that resolve `{ message: 'ok', task }` or `{ message: 'ok', comment }` resolve the
  resource instead: `ScrumBoardPage.test.tsx:196`, `useScrumBoard.test.ts:84-87`,
  `taskEditor.test.tsx:302` and `:331`, `comments.test.tsx:55`, `:69` and `:88`. A new
  `lib/__tests__/responseShapes.test.ts`, in the pattern of `emailApi.test.ts` (`apiRequest` mocked), shows
  that each of the three methods returns the resource for both shapes.

## Response shapes (D7)

- `move_task`, `create_story_comment` and `create_task_comment` (`app/scrum/views.py:162`, `:194`, `:208`)
  return `TaskOut` and `CommentOut`. FastAPI takes the response model from the return annotation, since
  the routes (`app/scrum/url.py:24`, `:28`, `:30`) name none.
- `update_tsr_entry` (`app/assignments/views.py:62`) returns the entry.
- `CommentResponse` goes. `TaskResponse` stays for creating and updating a task, which this batch doesn't
  touch. Status codes stay as they are.
- `tests/test_scrum_endpoints.py:70` reads the moved task at the top level. New endpoint tests show a
  comment and a TSR edit answering their resource at the top level.
- The web client accepts both shapes, for the minutes when the frontend is live and the backend is not,
  as the dependencies spec keeps its optional fields (D11 there).

## Round trips

Counted in executes, as `FakeSupabase` counts them.

| Route | Today | After |
|---|---|---|
| `POST /api/messages`, a reply in a direct message | 10 | 8 |
| `POST /api/messages`, a team channel with R recipients | 5 + 3R | 4 + 2R |
| `POST /api/scrum/tasks/{task_id}/move`, To do to Done, in a sprint, no dependencies | 9 | 6 |
| the same, with a done dependency | 10 | 7 |
| `POST /api/scrum/{stories\|tasks}/{id}/comments`, a member, no mention | 4 | 3 |
| `PATCH /api/assignments/{assignment_id}/tsrs/{tsr_id}`, evaluator / instructor | 5 / 4 | 3 / 3 |
| `POST /api/notifications/{notification_id}/read` | 2 | 1 |
| `GET /api/notifications` | unchanged | unchanged, one wave fewer |
| creating a story or a task, updating a story, in a sprint | — | one fewer each |

## Testing

### Backend

- **`tests/test_fake_supabase.py`:** items 1–6 of Test double.
- **`tests/test_messages_batching.py`:**
  - `send_message` makes `== 8` executes for a reply in a direct message, and `== 10` for a team channel
    with three recipients;
  - the participants are read once;
  - the notification title carries the embedded sender's name.
- **`tests/test_notifications_messages.py`:** its two calls pass `sender_name`, and a missing name gives
  "New message from Someone".
- **`tests/test_scrum_moves.py`:**
  - `== 9` becomes `== 6`, and `<= 10` becomes `<= 7`;
  - the response's `moved_by_name` is the mover's name;
  - the burnup row is written with the totals after the move;
  - with the trigger-backed fake, the embedded task shows the old status while the response reports the
    new one.
- **`tests/test_scrum_comments.py`, `tests/test_scrum_mentions.py`:** a comment with no mention makes
  `== 3` executes. With an eligible mention, the mention notification carries the embedded name and no
  profile read happens.
- **Burnup:** creating a task in a sprint makes one burnup read. Pin the route's total, 7 today and 6 after.
- **`tests/test_assignments.py`:**
  - `<= 5` becomes `== 3` for the evaluator, and `<= 4` becomes `== 3` for the instructor;
  - a closed window is still 403, now decided from the embedded assignment;
  - a TSR whose assignment cannot be embedded is 404 "Assignment not found".
- **Notifications (new tests):**
  - marking one read answers 204, sets `read_at` and makes `== 1` execute;
  - an unknown id or another user's id answers 404 (a 500 today);
  - the list returns what it returns today.

### Frontend

- The test changes listed in Web client, and `responseShapes.test.ts`.

**Gates:**
- backend: `ruff format . && ruff check . && python -m pytest --cov`;
- frontend: `npm run lint && npm run lint:design && npm run build && npm run test:coverage`.

### On DEV, before the pull request

- Send each write's select string through an update that matches nothing on its table (filtered by the
  nil UUID): `messages`, `task_moves`, `scrum_comments` and `TSRs`. PostgREST then resolves every embed
  without changing a row.
- Send the burnup read and the TSR read as plain reads.
- The pre-write snapshot is already checked (DEV check 2).

## Rollout

1. No migration.
2. Before the release, confirm on PROD that the seven foreign keys the writes name exist under the same
   names (`messages_sender_id_fkey`, `task_moves_moved_by_fkey`, `task_moves_task_id_fkey`,
   `tasks_story_id_fkey`, `scrum_comments_author_id_fkey`, `TSRs_evaluator_id_fkey`,
   `TSRs_evaluatee_id_fkey`). That takes one read-only catalog query, with the maintainer's approval. The
   migrations that created them used Postgres's default names, so they should match. If one doesn't, PROD
   would refuse that write.
3. Release as usual, `beta` to `main`. The web client accepts both response shapes, so the frontend can
   deploy before the backend. A tab opened before the release fails on a move, a comment or a TSR edit
   until it is reloaded (D7).
