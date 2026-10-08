# Analytics per Institution — Design Spec

**Date:** 2026-10-05, revised 2026-10-06 with the maintainer's answers (terms scoped out the same day)
**Branch:** `feat/analytics-dashboard-design`
**Status:** DESIGN AGREED in substance. Section 4 records the maintainer's decisions of 2026-10-06; the few
items still open are in section 11 (each has a default). The work is split into three sub-projects
(section 2); each gets its own implementation plan, in order.
**Design brief (to Claude Design):** `docs/superpowers/handoffs/2026-10-05-analytics-claude-design/README.md`
(components, chart rules, validated palette, sample data, the dashboard's data contract).

## 1. Goals

From the maintainer's request of 2026-10-05:

1. Analytics infrastructure that fits what we already pay nothing for — Vercel Hobby (web + API) and Supabase
   Free (Postgres) — and a dashboard in the GrepThink design language, with a brief so Claude Design can build
   the visualization components.
2. **One dashboard per university** (institution), internal, for instructors and maintainers.
3. **Conversations:** total messages sent, excluding staff ↔ student conversations.
4. **Scrum board:** stories and tasks created (counts and story points); a live snapshot of tasks across all
   teams in To do / In progress / Done by sprint; median character counts per task and per story.
5. **Timeliness** of TSR submissions and of the other assignments (feedback, interest forms), on top of a
   TSR flow that records submission times correctly.
6. **Trends over time**, which needs history that survives deletions (a nightly rollup). Every figure is
   scoped by a **dynamic date range**, never by term: a term stays what it is today, a label on a class.
7. An **events table** for product events the schema does not record (sign-ins, board views, TSR edits).

Minerva (`~/personal/minerva`) is inspiration only: one JSON payload per dashboard, filters in the URL,
per-panel failure tolerance, refetches that hold the previous render, an "aggregate only" footnote. Not its
stack or its dark admin look.

## 2. Sub-projects and order

The maintainer asked for the TSR flow to be fixed first. Three sub-projects, each with its own plan:

| | Sub-project | Delivers | Depends on |
|---|---|---|---|
| **A** | **Deadlines and events** | Assignment deadlines as instants (`due_at`, `accept_until`), server-side enforcement, reopening that keeps the original deadline, `"TSRs".updated_at`, the `events` table and the first events. | — |
| **B** | **Analytics core** | SQL functions, `analytics_daily` rollup + pg_cron, `app/analytics` API, the page with Conversations, Scrum, Trends and Breakdown cards, CSV export; Claude Design port. | A (events) |
| **C** | **Timeliness** | The timeliness SQL function, assignment outcomes in the rollup, the Timeliness cards. | A |

B and C can be one plan if A has landed by then. Nothing in B's data layer is blocked by A except the
active-users tile (events), so B's SQL can start as soon as A's migration is written.

## 3. What we checked: the free tiers (verified 2026-10-05)

| Item | Limit | Consequence here |
|---|---|---|
| Vercel Hobby cron jobs | once **per day** minimum, ±59 min precision, best-effort (skips, duplicates, no retry) | Not used. The nightly rollup runs under pg_cron inside Postgres. |
| Vercel functions (Fluid) | 300 s max, 2 GB; 1M invocations/month | A 5-RPC aggregation request fits trivially. |
| Vercel Web Analytics | 50k events/month, 1-month window, **no custom events** on Hobby | Page views only; product events land in our `events` table. |
| Vercel logs / Observability | runtime logs 1 h, Observability 12 h | Nothing we want to look back on may live in logs. |
| Supabase Free database | **500 MB**, Nano compute (shared CPU, 0.5 GB RAM) | DEV is 18.6 MB today. The rollup and events add well under 1 MB a month at current volume. |
| Supabase Free pausing | paused after **7 days** of low activity | Unchanged. Whether pg_cron runs count as activity is unverified; keep the existing keep-alive. |
| Supabase projects | **2 active** | Both used (DEV, PROD): no third "analytics" project. |
| pg_cron / pg_net | available on Free (1.6.4 / 0.19.5, listed in our org); **not installed on DEV**; the PROD email-dispatch cron SQL is staged, not applied | `CREATE EXTENSION pg_cron` is a maintainer step on DEV and PROD; the Vault-and-retention pattern is already written in the email cron file. |
| Supabase logs / Reports | 1 day / last 24 h | Same conclusion: derived numbers must be computed from our tables. |
| Supabase Analytics Buckets (Iceberg) | private alpha | Not planned on. |
| Materialized views, `REFRESH … CONCURRENTLY`, `GENERATED … STORED` | plain Postgres 17 (STORED only) | Available if volumes ever call for them. |
| PostHog Free, Umami Cloud, Grafana Cloud Free, Evidence | free tiers exist | Each moves or exposes student data to a third party, or adds a vendor for numbers Postgres already has. Not chosen. |

Volume on DEV (2026-10-05): 43 messages, 13 tasks, 8 stories, 2 sprints, 30 TSRs, 134 TSR assignments, 57
projects, 36 classes, 2 institutions. Every metric is a `GROUP BY` over a few thousand rows at most. PROD was not
read (production-read policy); it is the same shape with one active term.

**Conclusion.** Analytics stays inside Supabase Postgres: SQL functions called over RPC by the existing FastAPI,
a small rollup table filled nightly by pg_cron, an events table written by the backend, and a React page. No
new vendor, no new project, and student data never leaves the stack.

## 4. Decisions

### 4.1 Resolved by the maintainer on 2026-10-06

| # | Question | Decision | Effect on the design |
|---|---|---|---|
| 1 | Who sees a university's dashboard | Instructors and maintainers; an instructor sees every class at their institution(s) | §6.1 authorization. Instructors: institutions where they created a class. Maintainers: `ANALYTICS_ADMIN_EMAILS`. |
| 2 | Internal or public | Internal, signed in | No anonymous route. |
| 3 | Which messages count | Everything that is **not** instructor ↔ student or TA ↔ student. No attribution of DMs by shared class; totals are fine | §7: team ↔ TA and team ↔ instructor channels excluded by type; a DM is excluded when the pair shares a class in which one is staff (instructor or TA) and the other a student. DMs are counted **school-wide**, never per class; team-channel messages carry the per-class breakdown. |
| 4 | Messages, conversations or people | Messages | No distinct-sender or active-conversation figures. |
| 5 | "By sprint" across teams | Calendar weeks if easier, else each team's first sprint aligned as Sprint 1 | Ordinal alignment for the live snapshot (one window function; calendar weeks fragment rows when teams start on different weeks). Calendar weeks appear in the rollup's weekly trends. |
| 6 | Text length | Median; title + description as typed | The mean is dropped everywhere. |
| 7 | Counts or points; PR links | Story points **and** counts; PR links do not count | Snapshot and "created" figures carry both units; the card has a count/points toggle (one axis at a time). |
| 8 | Deadline instant | The school's time zone | `due_at` is computed from `close_date` in `institutions.timezone` (A). Follow-up: a repo-wide time-zone registry (section 12). |
| 9 | A TSR's submission time | Last row | `submitted_at` = the latest `created_at` among the evaluator's rows for the assignment (when they finished the set). Edits after the deadline are reported as "edited late", not as late submissions. |
| 10, 11 | Reopening overwrites the deadline; late is impossible through the UI | Refactor the TSR flow to record submission times correctly first | Sub-project A (§5): deadlines as instants, a late window instead of moving the deadline, server-side enforcement, `updated_at` on TSR rows. |
| 12 | Expected submitters | Current members; no membership history | TSR: current project members (teams of ≥ 2); feedback and interest: current enrolled students. |
| 13 | Interest forms (no `assignment_id`) | Class level | One interest form per class: the class's latest `interest_form` assignment by `close_date`; submissions match by `class_id`. |
| 14 | Trends over time | Yes | The nightly `analytics_daily` rollup ships in B, with a Trends card over the selected range and a previous-period comparison. |
| 15 | Term identity | **Terms stay labels** (YAGNI, 2026-10-06, replacing the earlier "standardize per university"). Analytics never scopes by term; every query takes a dynamic date range | No `term_system`, no vocabulary constraint, no picker change. The filter row offers presets (7d, 30d, 90d, class to date, all) and a custom from–to; the class's `term` string appears only as display text in the class picker. |
| 16 | Minimum group size; student visibility | 3; students never see this | Rows (class, team, assignment) with fewer than 3 people are folded into one "Smaller groups" row. No student-facing route. |
| 17 | Events table | Yes | A creates `events`; the backend records sign-ins, TSR submissions and edits, feedback submissions, reopenings; B adds board and analytics views and reads it (active users). |

### 4.2 Standing recommendations (unchanged from the first draft)

| # | Topic | Decision | Why |
|---|---|---|---|
| D2 | Compute strategy | On demand: one `STABLE` SQL function per section, called over `.rpc()`, fanned out concurrently, assembled payload cached in process for 60 s | Tiny data; precedents `messages_inbox`, `scrum_next_key`, `claim_email_outbox`. |
| D8 | Date ranges | Presets `7d`, `30d`, `90d`, `class` (from the selected class's `start_date` to today), `all`; or `custom` with explicit `from`/`to` (inclusive dates in the school's zone, `to ≥ from`, span ≤ 2 years). Counts are by `created_at` inside the range; the snapshot is live. Deltas compare with the previous range of equal length (null for `all`). | `assignments.close_date` and `sprints.starts_at` are bare dates; everything else is `timestamptz`. No term dimension anywhere (decision 15). |
| D9 | Route and navigation | `/app/analytics`, lazy, not class-scoped; sidebar item "Analytics" in Main for accounts that can create classes; filters in the query string | The institution is the frame; the class filter is its own control. |
| D10 | Chart technology | Token-driven SVG components in the `BurnupChart` idiom, delivered by Claude Design; recharts primitives allowed underneath; no new dependency | Passes `lint:design` by construction. |
| D11 | Payload | One `GET /api/analytics/dashboard` answers the page; `failures[]` names any section whose function failed while the rest renders | One request per filter change; one broken section cannot blank the page. |
| D12 | Caching and limits | `@limiter.limit("30/minute")`; in-process cache 60 s keyed by the full filter tuple, 128 entries; `Cache-Control: private, max-age=60`; `?fresh=1` bypasses | The `get_user_count` pattern; Vercel instances are independent, so this only smooths bursts. |
| D14 | Export | CSV of the breakdown table, built in the browser | No new endpoint. |
| D15 | Web analytics | Out of scope; enable Vercel Web Analytics separately | Free on Hobby; a different question. |
| D17 | SQL function hygiene | `LANGUAGE sql STABLE SET search_path = public`; `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role`; idempotent; a `-- Check` block | States the lockdown policy explicitly. |

## 5. Sub-project A — Deadlines as instants, a late window, submission timestamps, events

**Deadline model.**

```sql
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS due_at       timestamptz;  -- the deadline instant
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS accept_until timestamptz;  -- late window; NULL = closes at due_at
UPDATE assignments a
   SET due_at = ((a.close_date + 1)::timestamp AT TIME ZONE coalesce(i.timezone, 'America/Los_Angeles'))
  FROM classes c LEFT JOIN institutions i ON i.id = c.institution_id
 WHERE c.id = a.class_id AND a.close_date IS NOT NULL
   AND a.due_at IS DISTINCT FROM (<the same expression>);   -- repairs rows the old backend touched on a re-run
ALTER TABLE "TSRs" ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE "TSRs" SET updated_at = created_at WHERE updated_at = now();   -- pre-existing rows: last edit = submission
-- trigger: BEFORE UPDATE ON "TSRs" WHEN (OLD.* IS DISTINCT FROM NEW.*) SET NEW.updated_at = now()
```

The migration must be applied in the same sitting as the release: until the new backend is live, an
assignment created in between keeps `due_at` NULL and a rescheduled one keeps a stale `due_at`; re-running
the file once after the release repairs both (its Check's `stale_due_at` reads 0).

- `close_date` stays the field instructors edit and students see; the backend derives `due_at` as the first
  instant after that day in the school's zone, on create and on every change of `close_date`.
- **Before** `due_at` passes, changing `close_date` is a reschedule (`due_at` follows). **After** it passes, a
  change of `close_date` is refused (400 `"The deadline has passed; set a late-submission window instead"`) and
  the instructor sets `accept_until` instead — so the original deadline survives and late work is visible as
  late. The Modules page shows "Accept late submissions until …" once the deadline has passed.
- **Server-side enforcement** (new): `create_tsr`, `update_tsr_entry` (for the evaluator; the instructor may
  always edit) and `submit_feedback` refuse when `now() < open_date` in the school's zone (403 `"This
  assignment is not open yet"`) or `now() >= coalesce(accept_until, due_at)` (403 `"This assignment is
  closed"`). The web client keeps its lockout, extended by `accept_until`, and shows a "Submitted after the
  deadline" note on a late submission. Assignments with `due_at IS NULL` (no `close_date`) never close.
- **Submission semantics** (decision 9): a student's submission time for a TSR assignment is the latest
  `created_at` among their rows for it; `updated_at` records edits; "edited late" = `max(updated_at) > due_at`
  with `submitted_at <= due_at`.
- **Events table** (decision 17), created here because A writes the first events:

```sql
CREATE TABLE IF NOT EXISTS events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]{1,39}$'),
  actor_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  class_id    uuid REFERENCES classes(id)  ON DELETE SET NULL,
  project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
  meta        jsonb NOT NULL DEFAULT '{}' CHECK (pg_column_size(meta) <= 2048)
);
CREATE INDEX IF NOT EXISTS events_kind_time_idx  ON events (kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_class_time_idx ON events (class_id, occurred_at DESC) WHERE class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_actor_time_idx ON events (actor_id, occurred_at DESC);
ALTER TABLE events ENABLE ROW LEVEL SECURITY;   -- no policies, no client grants (lockdown policy)
```

  `ON DELETE SET NULL` keeps the count when a project or class is deleted — the reason the table exists.
  `app/core/events.py` exposes `record(kind, *, actor_id, class_id=None, project_id=None, meta=None)`: one
  insert, inside the request (Vercel may freeze the function after the response), failures logged at WARNING
  and never raised. `meta` holds ids and short enums only — never names, emails, grades or text (the Sentry
  scrubbing rule, applied here by construction). Kinds in A: `tsr_submitted`, `tsr_updated`,
  `feedback_submitted`, `assignment_reopened` (meta: `{assignment_id, accept_until}`), `login` (from
  `GET /api/login-check`). B adds `board_viewed` and `analytics_viewed`. Retention: 365 days, by the pg_cron
  job in B (⚑ Q-A2).

**Tests (A).** `due_at` derivation in both zones and across a DST boundary; reschedule allowed before the
deadline, refused after; a re-sent unchanged `close_date` after the deadline is not a move; `accept_until`
accepted and reflected, refused before the deadline or without one; `create_tsr` 403 when closed or not yet
open, 200 inside the late window; the instructor may still edit entries after close; `record()` never raises
and costs one execute; the migration's Check block on DEV (the trigger is checked there, not in the fake).

**Frontend (A).** Modules: late-window control after the deadline, due date no longer movable then; student
assignment pages: lock at `accept_until ?? due_at`, "Late submissions until …", a note on a submission made
after the deadline; dates rendered in the viewer's local time (the registry follow-up generalizes this).

## 6. Sub-project B — Analytics core

```
Supabase Postgres                            FastAPI on Vercel                       React on Vercel
analytics_* SQL functions (live)   ── RPC ──▶ app/analytics/controller.py ── JSON ──▶ features/analytics/AnalyticsPage
analytics_daily (nightly, pg_cron)             scope_for_user (4.1 #1)                  URL state ?institution&class&window&from&to
events (written by the backend)                fan_out(4 rpcs) → compose payload        one payload → cards; CSV in the browser
  STABLE, search_path = public                 k = 3 folding, failures[]                refetch holds the previous render
  EXECUTE: service_role only                   60 s cache, 30/min limiter
```

### 6.1 Backend module `backend/app/analytics/`

Follows url / views / controller / models.

- `url.py` — `router = APIRouter(prefix="/api/analytics", tags=["analytics"])`; `GET /scope`, `GET /dashboard`;
  both `@limiter.limit("30/minute")` with `request: Request`, behind `require_user` and `require_user_payload`
  (the email claim feeds the maintainer allowlist). `GET /dashboard` records an `analytics_viewed` event.
- `views.py` — the query parameters sit on the view (there is no query model): `institution_id: UUID`,
  `class_id: UUID | None`, `window: Literal['7d','30d','90d','class','all','custom'] = '30d'`, `from` and `to`
  (`date | None`; required with `custom`, ignored otherwise; `class` requires `class_id`), `fresh: bool = False`.
  FastAPI answers 422 for a bad window, uuid or date; a `WindowError` from `range_bounds` is a 422 as well.
- `models.py` — response models mirroring the brief's TypeScript contract. The tasks/points unit is a
  client-side toggle, not a query parameter.
- `windows.py` — pure functions: `range_bounds(window, today, *, class_start, custom_from, custom_to,
  all_from) -> RangeBounds`, a frozen dataclass `(window, start, end, prev_start, prev_end)` (`all_from`, the
  day the school's first class was created, starts `all`, which has no previous range; 422 `"from and to are
  required for a custom range"`, `"dates must fall between 2000-01-01 and 2100-12-31"`, `"to must be on or
  after from"`, `"a range may span at most 2 years"`, `"window=class needs class_id"` surfaced by the view).
- `privacy.py` — `fold_small_groups(rows, *, size_key, sum_keys, k=K_ANONYMITY, label=FOLDED_LABEL)`
  (`K_ANONYMITY = 3`, `FOLDED_LABEL = "Smaller groups"`): rows whose `size_key` is below k become one trailing
  "Smaller groups (n)" row. `trends.py` turns `analytics_trends`' weekly rows into the Trends panels and the
  tile sparklines and holds the `delta` helper; `cache.py` is the 60 s per-process payload cache.
- `controller.py`
  - `scope_for_user(user_id, email)`: maintainer (an ASCII `email` whose `.lower()` ∈
    `settings.ANALYTICS_ADMIN_EMAILS`) → all institutions; else the institutions of
    `classes.created_by = user_id`. Empty → `[]` for `/scope`, 403 for `/dashboard`.
  - `get_scope(...)`: institutions in scope with their classes (`id`, `name`, `label` ("name · term", or the
    name alone), `term`, `start_date`; the term is display text only, and `course_code`, the join code, never
    leaves).
  - `get_dashboard(...)`: validate scope (403; 404 `"institution does not exist"` when a maintainer names an
    unknown id); look up the cache right after that check, so a hit costs one read; then class ∈ institution
    (400); bounds; `fan_out` four RPCs (`analytics_scope_counts`, `analytics_conversations`, `analytics_scrum`,
    `analytics_trends`; C adds `analytics_timeliness`), each wrapped so a `DatabaseError` adds the cards that
    lose data to `failures` (their counts null); compose `overview` and `breakdown`; fold groups smaller than
    3; cache a payload without failures; return.
- `config.py` — `ANALYTICS_ADMIN_EMAILS` (comma-separated, lower-cased, blank = none).

### 6.2 SQL — migration `2026-10/<YYYY-MM-DD>_analytics.sql`

Idempotent: the rollup table, the rollup function, the section functions. Shared scoping (repeated in each
function):

```sql
WITH scope AS (
  SELECT c.id AS class_id, c.name
    FROM classes c
   WHERE c.institution_id = p_institution
     AND (p_class IS NULL OR c.id = p_class)),
teams AS (SELECT p.id AS project_id, p.class_id FROM projects p JOIN scope s ON s.class_id = p.class_id),
user_roles AS (                                   -- everyone's role in every class
  SELECT ce.user_id, ce.class_id, ce.enrollment_role AS role FROM class_enrollments ce
  UNION ALL SELECT c.created_by, c.id, 'instructor' FROM classes c)
```

Every function takes `(p_institution uuid, p_class uuid, p_from date, p_to date, p_prev_from date,
p_prev_to date, p_tz text)` and `RETURNS jsonb`; timestamps are bucketed in `p_tz`.

- **`analytics_scope_counts`** — classes, teams (projects with ≥ 1 member), students (distinct `student`
  enrollments), active users (distinct `login` actors in the last 7 days who hold a role at the institution;
  `null` until events exist), per class.
- **`analytics_conversations`** — decision 3:

  ```sql
  staff_student_dm AS (                            -- excluded: staff and a student of the same class
    SELECT DISTINCT c.id FROM conversations c
      JOIN user_roles a ON a.user_id = c.user_a
      JOIN user_roles b ON b.user_id = c.user_b AND b.class_id = a.class_id
     WHERE c.type = 'dm'
       AND ((a.role IN ('instructor','ta') AND b.role = 'student')
         OR (b.role IN ('instructor','ta') AND a.role = 'student'))),
  school_people AS (                               -- who belongs to this school, in any role
    SELECT DISTINCT ur.user_id FROM user_roles ur JOIN classes c ON c.id = ur.class_id
     WHERE c.institution_id = p_institution),
  counted_dm AS (                                  -- school-wide; ignores p_class by design
    SELECT c.id FROM conversations c
     WHERE c.type = 'dm' AND c.id NOT IN (SELECT id FROM staff_student_dm)
       AND c.user_a IN (SELECT user_id FROM school_people)
       AND c.user_b IN (SELECT user_id FROM school_people)),
  counted_team AS (                                -- per class, follows the class filter
    SELECT c.id, t.class_id FROM conversations c JOIN teams t ON t.project_id = c.project_id
     WHERE c.type = 'team_members')
  ```

  Returns `team_members`, `dm`, `total`, `weekly` (both series, Monday weeks in `p_tz`), previous-range
  values, `by_class` (team-channel messages only). `team_ta` and `team_instructor` never appear.
- **`analytics_scrum`** — `stories_created`, `tasks_created`, `story_points_created`, `task_points_created`
  (range and previous range), `weekly_tasks`, `by_sprint` (live: `tasks` ⋈ `user_stories` with `archived_at
  IS NULL`; ordinal `row_number() OVER (PARTITION BY sp.project_id ORDER BY sp.starts_at, sp.created_at)`;
  `NULL` sprint → 0 "Backlog"; counts and `sum(coalesce(points, 0))` per status; `teams` = distinct projects),
  `chars` (`percentile_cont(0.5) WITHIN GROUP (ORDER BY char_length(title) + char_length(coalesce(description_md,
  '')))` per entity, per ordinal and overall, all time), `by_class`.
- **`analytics_trends`** — reads `analytics_daily` for the range and for the previous range: weekly points
  (Monday, `p_tz`) of team messages per team, direct messages, tasks created per team, points done per team,
  active users, and the on-time rate of assignments finalized that week (from C's outcomes). Normalized per
  team because class sizes differ; `as_of` = the last rolled-up day. The current day is not in the rollup yet
  and is marked as such.
- **Rollup.**

  ```sql
  CREATE TABLE IF NOT EXISTS analytics_daily (
    institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    class_id       uuid,                                             -- NULL = school-wide metric; no foreign key
    day            date NOT NULL,
    metric         text NOT NULL,
    value          numeric NOT NULL,
    computed_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (institution_id, class_id, day, metric)
  );
  ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;              -- no policies, no client grants
  ```

  `analytics_rollup_day(p_day date, p_snapshot boolean DEFAULT false)` upserts, for every institution in its own
  zone: per class and day — `team_messages`, `stories_created`, `tasks_created`, `story_points_created`,
  `task_points_created`, `active_teams` (teams with a message, task, story or move that day), `board_views`
  (distinct person–board pairs among that day's `board_viewed` events), `teams` (as of the day: projects created
  by then with a current member who had joined by then; membership history is not kept), and, when `p_snapshot`
  is true, the board snapshot as of the run (`tasks_todo`, `tasks_in_progress`, `tasks_done`, `points_todo`,
  `points_in_progress`, `points_done`); per institution and day (`class_id NULL`) — `dm_messages`,
  `active_users` (distinct `login` actors). Snapshots are taken only when the nightly job asks, so re-running a
  past day never overwrites its board snapshot. `analytics_rollup_range(p_from, p_to)` backfills activity metrics
  (snapshots cannot be backfilled; they start at go-live). Idempotent upserts, so a re-run is safe. Rows survive
  class and project deletion, which is what makes long-range trends honest: `analytics_daily.class_id` has no
  foreign key, so deleted classes keep their history (under `ON DELETE SET NULL` the rows of two deleted classes
  would collide on the unique key).

  pg_cron (`prod/2026-10/…_analytics_cron.sql`, applied by hand on DEV then PROD after `CREATE EXTENSION
  pg_cron`): `analytics-rollup` at `0 9 * * *` UTC → `SELECT analytics_rollup_day(current_date - 1, true)` (01:00
  or 02:00 in Santa Cruz, 12:00 in Istanbul — the snapshot skew is documented in the Trends card's definition),
  `events-retention` daily (`DELETE FROM events WHERE occurred_at < now() - interval '365 days'`), and
  `cron-run-details-retention`, scheduled unconditionally with the same name and schedule as the email cron's
  (whichever file runs later replaces it). Everything the rollup needs is in the database, so unlike the email
  dispatcher there is no HTTP call, no secret and no Vault entry.
- **Folding (k = 3)** happens in Python after the RPCs: a class row with fewer than 3 students, a team row with
  fewer than 3 members, or a timeliness row with fewer than 3 expected submitters is summed into one row
  `kind: 'folded'`, label "Smaller groups (n)". Institution totals are unaffected.

Indexes: the only new indexes are on `analytics_daily` (its unique key `analytics_daily_uq` and
`analytics_daily_inst_day_idx`). The message CTEs read from the earlier lower bound of the two ranges, which
the existing `messages_conv_created_id_idx (conversation_id, created_at DESC, id DESC)` serves; stories and
tasks are read all time for the medians (hundreds of rows today). Revisit at ~100k messages.

### 6.3 API

```
GET /api/analytics/scope
  → { institutions: [{ id, name, slug, timezone, access: 'maintainer' | 'instructor',
                       classes: [{ id, name, label: 'name · term', term, start_date }] }] }
GET /api/analytics/dashboard?institution_id=…&class_id=…&window=30d[&from=2026-09-01&to=2026-10-05][&fresh=1]
  → AnalyticsDashboard (brief §5)
  400 class not of that institution · 403 outside the caller's scope · 404 unknown institution (maintainer) ·
  422 validation (bad window, uuid or date; range rules) · 429 rate limit · 503 database unavailable ·
  200 with failures[] when a section's function fails
```

Both routes join `frontend/public/.well-known/grepthink-actions.json` (`view_analytics_scope`,
`view_analytics_dashboard`, role `instructor`) and AGENTS.md's API-surface line.

### 6.4 Frontend

- `lib/api/analytics.ts` (`getAnalyticsScope`, `getAnalyticsDashboard`) spread into `api`; types in
  `lib/api/types.ts` matching the brief's contract.
- `features/analytics/` — `pages/AnalyticsPage.tsx` (lazy route), `hooks/useAnalyticsDashboard.ts` (query
  string ↔ state, sequence counter so a stale response is ignored, previous payload held while refetching, 60 s
  auto-refresh while visible), `components/` (ported from the kit: `AnalyticsFilterRow` with a date-range
  control, `StatTile` as an extension of `DashboardMetricCard`, `ChartCard`, `UnitToggle`, `WeeklyLine`,
  `SplitBar`, `StackedBars`, `TimelinessBars`, `OnTimeMeter`, `BarsBySprint`, `TrendLines`, `BreakdownTable`,
  `ChartLegend`, `ChartTooltip`, `DefinitionPopover`, `EmptyState`, `LivePill`), `utils/analyticsFormat.ts`,
  `analytics.scss` (tokens only, `.gt-*` classes verbatim from the kit).
- Sidebar: `{ label: 'Analytics', path: '/app/analytics', icon: BarChart3 }` in Main when `canCreateClasses`;
  `routePermissions.ts` untouched (not class-scoped; the backend decides; 403 renders "Analytics is available to
  instructors and maintainers.").
- Interim components honour the brief's rules until the kit arrives; the port replaces them file by file.

## 7. Metric definitions

| Metric | Definition | Excludes |
|---|---|---|
| Messages | Team-channel messages of teams in scope, plus direct messages between two people of the school, in the range. | Team ↔ TA and team ↔ instructor channels; DMs between staff and a student of a class they share. DMs are never per class. |
| Stories / tasks created | `user_stories` / `tasks` created in the range on boards of teams in scope; counts and points. Archived stories count. | — |
| Live board snapshot | Current `tasks.status` by the story's sprint ordinal within its project; Backlog for stories without a sprint; counts and points; across all teams in scope. Not ranged. | Tasks of archived stories. |
| Characters per task / story | Median of `char_length(title) + char_length(description_md)` as typed; per sprint ordinal and overall; all time. | Comments. |
| Active users | Distinct people of the school with a `login` event in the last 7 days. | Before the events table exists: not shown. |
| Trends | From the nightly rollup: weekly per-team-per-week rates and the on-time rate over the selected range, with the previous range of equal length for comparison; survives deletions. | The current day (rolled up tonight). |
| Timeliness (C) | Per assignment, each expected submitter's submission time (TSR: latest row) bucketed against `due_at`: early (> 24 h before), on time, late (before `accept_until`), missing, not due. On-time rate over passed deadlines. "Edited late" counted separately. | Draft assignments, assignments without a deadline, teams of one (TSR). |
| Folding | Any class, team or assignment row with fewer than 3 people becomes part of "Smaller groups". | Institution totals. |

## 8. Sub-project C — Timeliness

- **`analytics_timeliness(...)`** on A's columns:

  ```sql
  expected  := TSR: assignment × members of the class's projects having ≥ 2 members
               feedback: assignment × enrolled students
               interest_form: the class's latest interest assignment × enrolled students
  submitted := TSR: max("TSRs".created_at) per (assignment_id, evaluator_id)
               feedback: feedback_submissions.created_at
               interest_form: interest_submissions.submitted_at (matched by class_id)
  edited    := TSR: max("TSRs".updated_at); feedback: updated_at
  bucket    := CASE WHEN submitted IS NULL AND now() >= a.due_at THEN 'missing'
                    WHEN submitted IS NULL                        THEN 'not_due'
                    WHEN submitted >= a.due_at                    THEN 'late'
                    WHEN submitted >= a.due_at - interval '24 hours' THEN 'on_time'
                    ELSE 'early' END
  edited_late := submitted < a.due_at AND edited >= a.due_at
  ```

  `updated_at` is bumped by any edit, the instructor's included (`update_tsr_entry` lets the class instructor
  correct a student's row), so "edited late" must count the **evaluator's** edits only: take the latest
  `tsr_updated` event with `actor_id = evaluator_id` for that assignment (A records one per edit) rather than
  `updated_at` alone. Edits made before the migration are not recoverable (every pre-existing row has
  `updated_at = created_at`), so the figure reads 0 for dates before it.

  Assignments whose `due_at` falls inside the range are the ones reported. Returns `on_time_rate`,
  `expected`, `late`, `missing`, `edited_late`, rows per class (or per assignment when `p_class` is set,
  ordered by `due_at`), `by_class`.
- **Outcomes in the rollup:** `analytics_assignment_outcomes(assignment_id, class_id, institution_id, due_at,
  finalized_at, expected, early, on_time, late, missing, edited_late)`, upserted by the nightly job for every
  assignment whose `coalesce(accept_until, due_at)` passed more than 7 days ago and not yet finalized; feeds the
  Trends card's on-time rate and survives deletion.
- **Cards:** Timeliness card (meter + buckets per class or per assignment), the on-time stat tile, the on-time
  column in the breakdown.

## 9. Testing

**Backend (pytest, `FakeSupabase`).** A: section 5. B: scope (maintainer by env; instructor at two
institutions; none → `[]`; TA-only and student accounts → `/dashboard` 403); dashboard (RPC stubs → payload
shape; one stub raising `DatabaseError` → 200 with that section in `failures`; institution outside scope → 403;
class of another institution → 400; bad `window`, custom without dates, `to < from`, a 3-year span, `class`
without `class_id` → 422; second identical call → 0 executes; `fresh=1` executes again; round-trip budget
pinned); `windows.py` bounds and previous ranges across month and year boundaries; `fold_small_groups` (exact k
boundary, mixed kinds, totals preserved); `ANALYTICS_ADMIN_EMAILS` parsing; `events.record` never raises.
**SQL.** Each migration ends with a `-- Check` block with hand-computed expected values on DEV (for example the
UCSC team-message total equals a direct count; the staff ↔ student exclusion removes a known DM). An optional
pytest module (`tests/test_analytics_integration.py`, skipped unless `ANALYTICS_IT_DATABASE=1`) runs the functions
and `analytics_rollup_day` against DEV, asserting shape, non-negativity and cross-consistency (per-class sums
equal totals; buckets sum to `expected`; a second rollup run changes nothing).
**Frontend (vitest).** `analyticsFormat`; `useAnalyticsDashboard` (URL round trip incl. custom from/to, stale
response ignored, payload held while refetching); components (legend + table twin; `StackedBars` unit toggle
swaps the series without recoloring; folded row rendering; `TimelinessBars` not-due row; `TrendLines`
previous-period ghost line; `ChartCard` states); page test with a mocked `api`. `npm run lint:design` passes
with no ledger comments.

## 10. Rollout

1. **A** — the migration on DEV (`due_at`/`accept_until`/`updated_at`/`events`); Check block; PR onto `beta`;
   PROD migration **before** the release (the code reads `due_at` and writes `events` without feature
   detection).
2. **B** — `CREATE EXTENSION pg_cron` on DEV (maintainer); `analytics.sql` on DEV; cron SQL on DEV; verify
   `cron.job` and one rollup run; PR onto `beta` with `ANALYTICS_ADMIN_EMAILS` documented in `.env.example` and
   DEPLOY.md; Claude Design round and port; PROD: `CREATE EXTENSION pg_cron` (also unblocks the staged email
   cron), `analytics.sql`, cron SQL, `analytics_rollup_range` backfill of activity metrics from the first class's
   `start_date`; set `ANALYTICS_ADMIN_EMAILS` in Vercel if maintainers need every institution.
3. **C** — `analytics_timeliness` and outcomes on DEV then PROD; PR onto `beta`.
4. Verify on PROD after each step: the Check blocks, `/app/analytics` as an instructor, a direct count against
   the messages total, `SELECT jobname, active FROM cron.job`, and `SELECT max(day) FROM analytics_daily` the
   morning after.

## 11. Still open (each has a default; answer when convenient)

| # | Question | Default in this spec |
|---|---|---|
| Q-A2 | Late policy: with no late window, does an assignment close exactly at `due_at`? Retention of `events`? | Yes, closes at `due_at`; reopening is always an explicit late window. Events kept 365 days. |
| Q-B1 | Rollup time 09:00 UTC (one run for both schools) | Yes; the snapshot skew for Istanbul is documented |
| Q-B2 | Which events in v1 beyond `login`, `tsr_submitted`, `tsr_updated`, `feedback_submitted`, `assignment_reopened`, `board_viewed`, `analytics_viewed` | None |
| Q-B3 | Trends normalized per team per week, with the previous range as the comparison | Yes |
| Q-B4 | Messages card when a class is selected: team-channel messages of that class, with the school-wide DM figure shown separately | Yes |
| Q-B5 | Custom range cap of 2 years | Yes |

## 12. Follow-ups outside these sub-projects

- **Time-zone registry (maintainer, 2026-10-06):** one source for the zone each surface formats in —
  `institutions.timezone` on the backend (`institution_timezone()` exists), a frontend hook fed by the class's
  institution — replacing the hard-coded America/Los_Angeles in `reviewDates.ts`, the 11:59 PM PST label in
  `StudentHomeDashboard.tsx`, and the scrum board's day bucketing. To be opened as an issue.
- `supabase/schema.sql` does not yet reflect institutions, conversation participants or the email outbox; the
  A and B objects join it once applied, as AGENTS.md requires.
- PROD volume was not measured (production-read policy); record the counts in the migration Check blocks.
- Claude Design round for `components/analytics/`; the kit's NOTES.md may change layout choices in brief §9.
