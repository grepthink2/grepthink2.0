# Analytics per Institution — Design Spec

**Date:** 2026-10-05
**Branch:** `feat/analytics-dashboard-design`
**Status:** DRAFT — written in an autonomous session. The **Decisions** table is recommendations, not
maintainer-approved choices; rows marked ⚑ most need review. Section 11 lists the questions whose answers
change the numbers.
**Design brief (to Claude Design):** `docs/superpowers/handoffs/2026-10-05-analytics-claude-design/README.md`
(components, chart rules, validated palette, sample data, the dashboard's data contract).

## 1. Goals

From the maintainer's request:

1. Analytics infrastructure that fits what we already pay nothing for — Vercel Hobby (web + API) and Supabase
   Free (Postgres) — and a dashboard in the GrepThink design language, with a brief so Claude Design can build
   the visualization components.
2. **One dashboard per university** (institution).
3. **Conversations:** total messages sent, excluding team ↔ TA and team ↔ instructor channels.
4. **Scrum board:** total stories and tasks created; a live snapshot of tasks across all teams in To do /
   In progress / Done by sprint; average character counts per task and per story across sprints.
5. **Timeliness** of TSR submissions and of the other assignments (feedback, interest forms).
6. The list of ambiguities to resolve to make this truly data-driven (section 11).

Minerva (`~/personal/minerva`) is inspiration only. What we take: one JSON payload per dashboard, filters kept
in the URL so views are shareable, per-panel failure tolerance (`failures[]`), refetches that hold the previous
render, an "aggregate only" footnote. What we do not take: its stack (Astro, Cloudflare Analytics Engine, KV)
or its dark admin look.

## 2. Non-goals (v1)

- Page-view analytics. Vercel Web Analytics is free on Hobby (50k events/month, no custom events) and is a
  one-line add, independent of this work (D15).
- A product-events table for things the schema does not record (logins, board views, TSR edits) (D16).
- History that survives deletions, trends across terms (phase 2 rollup, D3).
- Anything student-facing, and per-student rows anywhere.
- Dark mode (the app has none).

## 3. What we checked: the free tiers (verified 2026-10-05)

| Item | Limit | Consequence here |
|---|---|---|
| Vercel Hobby cron jobs | once **per day** minimum, ±59 min precision, best-effort (skips, duplicates, no retry) | Not usable for scheduling anything that matters. pg_cron if a schedule is ever needed. |
| Vercel functions (Fluid) | 300 s max, 2 GB; 1M invocations/month | A 5-RPC aggregation request fits trivially. |
| Vercel Web Analytics | 50k events/month, 1-month window, **no custom events** on Hobby | Page views only; product events must land in Postgres. |
| Vercel logs / Observability | runtime logs 1 h, Observability 12 h | Nothing we want to look back on may live in logs. |
| Supabase Free database | **500 MB**, Nano compute (shared CPU, 0.5 GB RAM) | DEV is 18.6 MB today. Aggregation on demand is fine for years. |
| Supabase Free pausing | paused after **7 days** of low activity | Unchanged; the keep-alive exists (DEV only, see ops notes). |
| Supabase projects | **2 active** | Both used (DEV, PROD): no third "analytics" project. |
| pg_cron / pg_net | available on Free (1.6.4 / 0.19.5, listed in our org); **not installed on DEV** (`cron.job` does not exist); the PROD email-dispatch cron SQL is staged, not applied | A schedule is possible when wanted; the pattern (Vault secret, retention jobs) is already written. |
| Supabase logs / Reports | 1 day / last 24 h | Same conclusion: derived numbers must be computed from our tables. |
| Supabase Analytics Buckets (Iceberg) | private alpha | Not planned on. |
| Materialized views, `REFRESH … CONCURRENTLY`, `GENERATED … STORED` | plain Postgres 17 (STORED only) | Available if volumes ever call for them. |
| PostHog Free (1M events), Umami Cloud (100k, 1 site), Grafana Cloud Free (3 users, Postgres source via the Supabase pooler), Evidence (MIT static build) | free | All would move or expose student data to a third party, or add a vendor for numbers Postgres already has. Not chosen. Plausible, Metabase Cloud, Tinybird: paid or oversized. |

Volume on DEV (2026-10-05): 43 messages, 13 tasks, 8 stories, 2 sprints, 30 TSRs, 134 TSR assignments, 57
projects, 36 classes, 2 institutions. Every metric below is a `GROUP BY` over a few thousand rows at most; the
cost that matters is the PostgREST round trip, not the SQL. PROD was not read (production-read policy); it is
the same shape, one active term.

**Conclusion.** Analytics stays inside Supabase Postgres as SQL functions called over RPC by the existing
FastAPI, rendered by a React page. No new vendor, no new project, no schedule in v1, and student data never
leaves the stack.

## 4. Decisions (recommended — ⚑ = review before implementing)

| # | Question | Recommendation | Why / alternative |
|---|---|---|---|
| D1 ⚑ | Who may open an institution's dashboard? | **Instructors** see every institution in which they created at least one class; **maintainers** listed in a new `ANALYTICS_ADMIN_EMAILS` env var (matched against the token's verified email) see all institutions. TAs and students: 403. | No admin concept exists in the codebase (checked: none). An env allowlist is the smallest honest one and follows "secrets stay server-side". Alt: an `institution_admins` table — add when a second school has its own staff. **Open:** whether an instructor should see other instructors' classes at the same school (section 11, Q3). |
| D2 | Compute strategy | **On demand**: one SQL function per section, `STABLE`, called over `.rpc()`; the controller fans the four calls out concurrently and caches the assembled payload in process for 60 s. | Tiny data, sub-second queries, nothing to keep fresh. Precedents: `messages_inbox`, `scrum_next_key`, `claim_email_outbox`. Alt: pull rows through PostgREST and aggregate in Python — pays N round trips and the 1000-row page limit for nothing. |
| D3 ⚑ | History and deletions | **None in v1.** Deleting a project cascades to its conversations, messages, tasks and TSRs (#197), so totals shrink. Phase 2: a nightly `analytics_daily` rollup by pg_cron. | The five requested metrics are totals, a live snapshot, averages and per-assignment rates — none needs history. Deciding now whether trends matter (Q29–30) decides whether the rollup ships. |
| D4 ⚑ | Which messages count, and to which school | Count `messages` whose conversation `type ∈ {dm, team_members}`. A team channel belongs to its project's class's institution. A DM belongs to the institution of the **most recent class both participants share** (deterministic); a DM with no shared class is excluded and reported as `conversations.unattributed`. | The request excludes `team_ta` and `team_instructor` by type. Users have no institution of their own; the shared-class rule attributes without inventing one. Alt: the sender's school from `edu_email` domain (fails for Gmail accounts), or exclude DMs from per-school totals (loses most traffic: DEV has 40 DM messages out of 43). |
| D5 ⚑ | "By sprint" across teams | Align sprints by **ordinal within each project** (`row_number()` over `starts_at`): "Sprint 1" is every team's first sprint. Stories with no sprint are **Backlog** (ordinal 0). Tasks of archived stories are excluded from the live snapshot but count as created. | Sprints are per project with free-text names and different dates; the burnup's cumulative chart already labels them S1…Sn. Alt: align by calendar week — breaks when classes start on different weeks. |
| D6 ⚑ | Characters per task / story | `char_length(title) + char_length(coalesce(description_md, ''))`, markdown as typed; report **median and mean**, overall and per sprint ordinal. | One long description skews a mean of 13 tasks; the median is the honest headline, the mean is what was asked for. Alt: description only, strip markdown, include comments. |
| D7 ⚑ | Timeliness | Deadline = the first instant after `close_date` in the institution's time zone. Expected submitters: current team members for a TSR (teams with ≥ 2 members), currently enrolled students for feedback and interest forms. Submission time = **first** submission (TSR: earliest `created_at` among the evaluator's rows for that assignment; feedback: `created_at`; interest form: `submitted_at`). Buckets: early (> 24 h before), on time (last 24 h), late, missing (deadline passed, nothing), not due yet. On-time rate = (early + on time) / expected over assignments whose deadline has passed. | Matches the student UI, which pins due dates to 11:59 PM Pacific (`StudentHomeDashboard.tsx`), generalized through `institutions.timezone`. TSR rows are updated in place without an `updated_at` (the first `created_at` survives edits). Section 11 lists the eight sub-questions. |
| D8 | Windows and terms | Counts are by `created_at` within `[from, to]`; the snapshot is live. Windows: 7d / 30d / 90d / term / all; "term" runs from the earliest `start_date` of the classes in scope. Deltas compare with the previous window of equal length (null for term/all). A term is the pair `(classes.term, classes.year)` as entered; the label is "Fall 2026". | `assignments.close_date` and `sprints.starts_at` are bare dates; everything else is `timestamptz`. The term pair is free text today (Q31). |
| D9 | Route and navigation | `/app/analytics`, lazy route, **not class-scoped**; sidebar item "Analytics" in the Main section for accounts that can create classes; filters (`institution`, `term`, `year`, `class`, `window`) in the query string. | Mirrors the brief. The page ignores the sidebar's selected class; the class filter is its own control. A maintainer with a student account reaches it by URL. |
| D10 | Chart technology | Token-driven SVG components in the `BurnupChart` idiom (colors via CSS classes bound to `--gt-*`), delivered by Claude Design per the brief; recharts primitives allowed underneath where cheaper; no new dependency. | Passes `lint:design` by construction. Scrum D13 precedent. |
| D11 | Payload | One `GET /api/analytics/dashboard` answers the whole page; the controller composes `overview` and `breakdown` from the three section functions plus a scope-counts function, and lists any section that failed in `failures[]` while the rest renders. | One request per filter change; a slow or broken section cannot blank the page. |
| D12 | Caching and limits | `@limiter.limit("30/minute")`; in-process cache 60 s keyed by (institution, term, year, class, window), capped at 128 entries; `Cache-Control: private, max-age=60`; `?fresh=1` bypasses the server cache (still rate limited). | The `get_user_count` pattern. Vercel instances are independent, so the cache is best effort — the queries are cheap enough that this only smooths bursts. |
| D13 ⚑ | Privacy | Aggregates only. No per-student row or name anywhere. Per-team rows only when a class is selected. No minimum-group suppression in v1. | Instructors already see their teams' names and TSRs in the app. Suppression thresholds (k-anonymity) are a policy question (Q32). |
| D14 | Export | CSV of the breakdown table, built in the browser from the payload (`exportClassCsv.ts` precedent). | "Data-driven" people want the numbers in a spreadsheet; no new endpoint. |
| D15 | Web analytics | Out of scope; recommend enabling Vercel Web Analytics on the frontend project separately. | Free on Hobby; page views are a different question from product usage. |
| D16 ⚑ | Product events the schema lacks | Not in v1. If wanted later: an `events(occurred_at, kind, actor_id, class_id, project_id, meta jsonb)` table written by the backend, with a retention job. | The five requested metrics are fully served by existing timestamps. Logins, board views, message reads and TSR edits are not recorded anywhere today (Q36). |
| D17 | SQL function hygiene | `LANGUAGE sql STABLE SET search_path = public`; `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role`; idempotent `CREATE OR REPLACE`; a `-- Check` block with expected values on DEV. | The browser roles hold no table grants, so an invoker-rights function would fail for them anyway; revoking EXECUTE states the lockdown policy explicitly (`2026-09-21_lock_down_direct_table_access.sql`). |

## 5. Current-state facts the design relies on (verified in the codebase and on DEV)

- **Authorization is Python-only**; `service_client` bypasses RLS (AGENTS.md). Every analytics endpoint gates in
  the controller. There is **no platform-admin concept** anywhere in `backend/app`.
- **Conversations:** `type ∈ {dm, team_ta, team_instructor, team_members}`; team channels carry `project_id`;
  DMs carry `user_a < user_b`; `conversation_participants` holds roles. Messages: `body` (1–1024 chars),
  `sender_id`, `created_at`. Project deletion cascades through conversations to messages (migration
  `2026-10-02_project_delete_cascades.sql`).
- **Scrum:** `sprints(project_id, starts_at, ends_at, status)`, `user_stories(project_id, sprint_id nullable,
  title, description_md ≤ 20000, points, archived_at, created_at)`, `tasks(story_id, project_id, status
  todo|in_progress|done, title, description_md, created_at, moved_at)`, `task_moves` audit,
  `sprint_burnup_days` snapshots. Tasks reach their sprint through their story.
- **TSRs:** `"TSRs"(evaluator_id, evaluatee_id, project_id, assignment_id nullable, week, created_at)`; one row
  per (evaluator, evaluatee, project, assignment-or-week); a resubmission **updates the row in place** and keeps
  `created_at`; there is no `updated_at`. On DEV 27 of 30 rows carry an `assignment_id`.
- **Assignments:** `open_date`, `close_date` are bare `date`s; `status ∈ {draft, publish}`; `assignment_type ∈
  {tsr, interest_form, feedback}`. **The backend never enforces `close_date`** (the lockout is in the web client
  only). Reopening an assignment is an `UPDATE` of `close_date`, which overwrites the original deadline.
  `feedback_submissions` has `created_at`/`updated_at`; `interest_submissions` has `submitted_at` and
  `class_id` but **no `assignment_id`**.
- **Institutions:** `institutions(id, name, slug, email_domains, timezone)`, `classes.institution_id` (all DEV
  classes assigned). `classes.term` and `classes.year` are free text / float. Two institutions exist.
- **Membership history is not recorded**: `project_members` and `class_enrollments` are current state.
- **Frontend:** `DashboardMetricCard` (KPI tile), `BurnupChart` (SVG idiom), `useTableSort`, `Skeleton`,
  `StatTooltip`, `exportClassCsv.ts` exist; recharts is a dependency (pie charts); `lint:design` fails on any raw
  hex outside the token files; sidebar sections come from `buildSidebarConfig`, class-scoped page rules from
  `routePermissions.ts`.
- **Tests:** `tests/fake_supabase.py` supports `rpc={name: fn}` and counts `executes`; conftest mints HS256
  tokens with an `email` claim.

## 6. Architecture

```
Supabase Postgres                       FastAPI on Vercel                       React on Vercel
analytics_* SQL functions   ── RPC ──▶  app/analytics/controller.py  ── JSON ──▶ features/analytics/AnalyticsPage
  scope CTE: institution → classes        scope_for_user (D1)                     URL state ?institution&term&year&class&window
  → projects, filtered by term/class      fan_out(4 rpcs) → compose payload        one payload → cards; CSV in the browser
  STABLE, search_path = public            per-section failures[]                  refetch holds the previous render
  EXECUTE: service_role only              60 s in-process cache, 30/min limiter
```

### 6.1 Backend module `backend/app/analytics/`

Follows the url / views / controller / models convention.

- `url.py` — `router = APIRouter(prefix="/api/analytics", tags=["analytics"])`; `GET /scope`, `GET /dashboard`;
  both `@limiter.limit("30/minute")` with a `request: Request` parameter, both behind `require_user_payload`
  (the email claim is needed for the maintainer allowlist).
- `models.py` — `DashboardQuery` (`institution_id: UUID`, `term: str | None` ≤ 40 chars, `year: int | None`,
  `class_id: UUID | None`, `window: Literal['7d','30d','90d','term','all'] = '30d'`, `fresh: bool = False`), and
  response models mirroring the TypeScript contract in the brief (`AnalyticsDashboard`, `AnalyticsScope`).
- `windows.py` — pure functions: `window_bounds(window, today, term_start) -> (from, to, prev_from, prev_to)`;
  `term_label(term, year)`. Unit-tested without a database.
- `controller.py`
  - `scope_for_user(user_id, email) -> Scope`: maintainer (`email.lower()` ∈ `settings.ANALYTICS_ADMIN_EMAILS`)
    → all institutions (`load_institutions()`); else the institutions of `classes.created_by = user_id` (one
    read). Empty scope → `[]` for `/scope`, 403 for `/dashboard`.
  - `get_scope(...)`: institutions in scope, each with its `(term, year)` pairs and classes (`id`, `name`,
    `course_code`) — one classes read for instructors, one for maintainers.
  - `get_dashboard(...)`: validate the institution is in scope (403 `"Analytics is not available for this
    institution"`), the class belongs to it (400 `"Class is not in this institution"`); compute bounds; serve
    from cache unless `fresh`; `fan_out` the four RPCs, each wrapped so a `DatabaseError` adds the section to
    `failures` and leaves it `None`; compose `overview` and `breakdown`; cache; return.
- `config.py` — `ANALYTICS_ADMIN_EMAILS` (comma-separated, blank = none). Documented in `.env.example` and
  DEPLOY.md.

### 6.2 SQL — one migration `backend/database/migrations/2026-10/2026-10-05_analytics_functions.sql`

Idempotent, functions only, no tables, no data. Applied DEV first, then PROD (AGENTS.md).

Shared scoping, repeated in each function (SQL functions cannot share a CTE):

```sql
WITH scope AS (
  SELECT c.id AS class_id, c.name, c.course_code
    FROM classes c
   WHERE c.institution_id = p_institution
     AND (p_class IS NULL OR c.id = p_class)
     AND (p_term IS NULL OR (c.term = p_term AND c.year = p_year))
),
teams AS (
  SELECT p.id AS project_id, p.class_id
    FROM projects p JOIN scope s ON s.class_id = p.class_id
)
```

Every function takes `(p_institution uuid, p_term text, p_year int, p_class uuid, p_from date, p_to date,
p_prev_from date, p_prev_to date, p_tz text)` and `RETURNS jsonb`. Timestamps are bucketed in `p_tz`
(`institutions.timezone`, read by the controller).

- `analytics_scope_counts` — classes, teams (projects with ≥ 1 member), students (distinct enrolled
  `enrollment_role = 'student'`), per class.
- `analytics_conversations` — `total`, `by_type`, `weekly` (`date_trunc('week', m.created_at AT TIME ZONE p_tz)`,
  Monday), `previous_total`, `unattributed`, `by_class`. Attribution:

  ```sql
  user_classes AS (
    SELECT user_id, class_id FROM class_enrollments
    UNION SELECT created_by, id FROM classes),
  dm_home AS (                     -- a DM lives in the most recent class both people share
    SELECT c.id AS conversation_id, cl.id AS class_id
      FROM conversations c
      JOIN LATERAL (
        SELECT cl.* FROM classes cl
         WHERE EXISTS (SELECT 1 FROM user_classes ua WHERE ua.user_id = c.user_a AND ua.class_id = cl.id)
           AND EXISTS (SELECT 1 FROM user_classes ub WHERE ub.user_id = c.user_b AND ub.class_id = cl.id)
         ORDER BY cl.created_at DESC LIMIT 1) cl ON true
     WHERE c.type = 'dm'),
  team_home AS (
    SELECT c.id AS conversation_id, t.class_id
      FROM conversations c JOIN teams t ON t.project_id = c.project_id
     WHERE c.type = 'team_members')
  ```

  Messages join `dm_home ∪ team_home`, then `scope`. `team_ta` and `team_instructor` never appear.
- `analytics_scrum` — `stories_created`, `tasks_created` (by `created_at` in window, with previous-window
  values), `weekly_tasks` (for the sparkline), `by_sprint` (live: `tasks` ⋈ `user_stories` with
  `archived_at IS NULL`, ordinal via `row_number() OVER (PARTITION BY sp.project_id ORDER BY sp.starts_at,
  sp.created_at)`, `NULL` sprint → 0 "Backlog"; `teams` = distinct projects with any task in that ordinal),
  `chars` (`percentile_cont(0.5) WITHIN GROUP (ORDER BY len)` and `avg(len)`, per entity, per ordinal and
  overall; all stories/tasks ever created in scope, not windowed), `by_class`.
- `analytics_timeliness` — for published assignments of scope classes with a `close_date`:

  ```sql
  deadline  := ((a.close_date + 1)::timestamp AT TIME ZONE p_tz)   -- first instant after the due day
  expected  := TSR: (assignment × project_members of the class's projects having ≥ 2 members)
               feedback, interest_form: (assignment × enrolled students of the class)
  submitted := TSR: min("TSRs".created_at) per (assignment_id, evaluator_id)
               feedback: feedback_submissions.created_at per (assignment_id, student_id)
               interest_form: interest_submissions.submitted_at per (class_id, user_id), matched to the
                 class's interest assignment whose [open_date, close_date] contains submitted_at::date,
                 else the class's latest interest assignment
  bucket    := CASE WHEN submitted IS NULL AND now() >= deadline THEN 'missing'
                    WHEN submitted IS NULL                       THEN 'not_due'
                    WHEN submitted >= deadline                   THEN 'late'
                    WHEN submitted >= deadline - interval '24 hours' THEN 'on_time'
                    ELSE 'early' END
  ```

  Returns `on_time_rate`, `expected`, `late`, `missing`, `rows` per class (or per assignment when `p_class` is
  set, ordered by `close_date`), `by_class`. Assignments whose deadline has not passed are reported but excluded
  from the rate.

Indexes: none needed at current volume. When `messages` passes ~100k rows, add `messages (created_at)` and
`tasks (created_at)`; `"TSRs" (assignment_id, evaluator_id, created_at)` when TSRs pass ~50k. Noted in the
migration header, not created now.

### 6.3 API

```
GET /api/analytics/scope
  → { institutions: [{ id, name, slug, timezone, access: 'maintainer' | 'instructor',
                       terms: [{ term, year, label, classes: [{ id, name, course_code }] }] }] }
GET /api/analytics/dashboard?institution_id=…&term=Fall&year=2026&class_id=…&window=30d[&fresh=1]
  → AnalyticsDashboard (brief §5)
  400 bad or mismatched parameters · 403 outside the caller's scope · 422 validation ·
  429 rate limit · 503 database unavailable · 200 with failures[] when a section's function fails
```

Errors use the standard `{detail, code}` body. Both routes are added to
`frontend/public/.well-known/grepthink-actions.json` (`view_analytics_scope`, `view_analytics_dashboard`, role
`instructor`) and to the API-surface line in AGENTS.md.

### 6.4 Frontend

- `lib/api/analytics.ts` (`getAnalyticsScope`, `getAnalyticsDashboard`) spread into `api`; types
  `ApiAnalyticsScope`, `ApiAnalyticsDashboard` in `lib/api/types.ts`, matching the brief's contract.
- `features/analytics/` — `pages/AnalyticsPage.tsx` (lazy route), `hooks/useAnalyticsDashboard.ts` (query-string
  ↔ state, fetch with a sequence counter so a stale response is ignored, hold the previous payload while
  refetching, 60 s auto-refresh paused while the tab is hidden), `components/` (ported from the Claude Design
  kit: `AnalyticsFilterRow`, `StatTile` as an extension of `DashboardMetricCard`, `ChartCard`, `WeeklyLine`,
  `SplitBar`, `StackedBars`, `TimelinessBars`, `OnTimeMeter`, `BarsBySprint`, `BreakdownTable`, `ChartLegend`,
  `ChartTooltip`, `DefinitionPopover`, `EmptyState`, `LivePill`), `utils/analyticsFormat.ts` (compact numbers,
  percentages, signed deltas, week labels, CSV), `analytics.scss` (tokens only, `.gt-*` classes verbatim from
  the kit — scrum D12 precedent).
- Sidebar: `{ label: 'Analytics', path: '/app/analytics', icon: BarChart3 }` appended to the Main section when
  `canCreateClasses`. `routePermissions.ts` is untouched: the page is not class-scoped; the backend decides, and
  a 403 renders "Analytics is available to instructors and maintainers."
- Preview mode ("View class as student") is unaffected: the page only reads.
- Until the kit arrives, the page ships with interim components that honour the brief's rules (tokens, mark
  specs, legend + table twin); the port replaces them file by file when `git diff design/` lands.

## 7. Metric definitions (what the numbers mean)

| Metric | Definition | Excludes |
|---|---|---|
| Messages | `messages` rows created in the window whose conversation is a DM or a team-member channel attributed to a class in scope (D4). | `team_ta`, `team_instructor`; DMs with no shared class (reported as unattributed). |
| Stories / tasks created | `user_stories` / `tasks` with `created_at` in the window on boards of teams in scope. Archived stories count. | Nothing else. |
| Live board snapshot | Current `tasks.status` grouped by the story's sprint ordinal within its project; Backlog for stories without a sprint; across all teams in scope. Not windowed. | Tasks of archived stories. |
| Characters per task / story | `char_length(title) + char_length(description_md)` as typed; median and mean; per sprint ordinal and overall; all time. | Comments. |
| Timeliness | Per assignment, each expected submitter's first submission bucketed against the end of the due date in the school's time zone (D7). On-time rate over assignments whose deadline has passed. | Draft assignments, assignments without a due date, teams of one (TSR). |
| Deltas | Current window vs the previous window of equal length. | Term and all-time windows (null). |

## 8. Testing

**Backend (pytest, `FakeSupabase`).**
- Scope: maintainer by env → all institutions; instructor with classes at two institutions → both; instructor
  with none → empty list (200); TA-only and student accounts → `/dashboard` 403; `email` claim missing →
  instructor path only.
- Dashboard: four `rpc` stubs → payload shape and composed `overview`/`breakdown`; one stub raising
  `DatabaseError` → 200 with `failures == ['scrum']` and `scrum is None`; institution outside scope → 403; class
  of another institution → 400; bad `window` → 422; second identical call → 0 executes (cache); `fresh=1` →
  executes again; round-trip budget pinned (scope read + 4 RPCs).
- `windows.py`: bounds for every window, previous-window math, month boundaries, term with no `start_date`.
- Config: `ANALYTICS_ADMIN_EMAILS` parsing (blank, spaces, case).

**SQL.** The migration ends with a `-- Check` block whose expected values on DEV are hand-computed from the
seed (for example the UCSC messages total equals a direct count over `dm`/`team_members` conversations). An
optional `-m integration` pytest runs the four functions against DEV when `ANALYTICS_IT_DATABASE=1` and asserts
shape, non-negativity and cross-consistency (per-class sums equal totals; bucket counts sum to `expected`).
pgTAP is available on Supabase but unused in the repo; not introduced here.

**Frontend (vitest).** `analyticsFormat` (compact numbers, percent, delta sign and tone, week labels, CSV
escaping); `useAnalyticsDashboard` (URL round trip, stale response ignored, previous payload held while
refetching); components (`StackedBars` renders a legend and labels only segments that fit; `TimelinessBars`
not-due row; `ChartCard` states); page test with a mocked `api` (first institution selected from scope, 403
message). `npm run lint:design` passes with no ledger comments.

## 9. Rollout

1. DEV: apply the functions migration; run its Check block; record the applied date in the header.
2. PR onto `beta`: backend module, frontend page, actions catalog, AGENTS.md API line, `.env.example` and
   DEPLOY.md entries for `ANALYTICS_ADMIN_EMAILS`. Gates: ruff, pytest, eslint, `lint:design`, build, vitest.
3. Send the brief to Claude Design; port the returned kit (`design/PORTING.md`), replacing the interim
   components; record deviations from the brief in the kit's NOTES.md.
4. PROD: apply the migration before or after the release — either order is safe (a missing function makes
   that section's card show an error while the page renders). Set `ANALYTICS_ADMIN_EMAILS` in Vercel (backend,
   Production) only if maintainers need every institution.
5. Verify on PROD: `SELECT analytics_conversations(<ucsc>, NULL, NULL, NULL, current_date - 30, current_date,
   current_date - 61, current_date - 31, 'America/Los_Angeles')`; open `/app/analytics` as an instructor;
   compare the messages total with a direct count.

## 10. Phase 2 (only if the answers below ask for it)

- `analytics_daily(institution_id, class_id, day, metric, value)` filled nightly by `analytics_rollup_day(date)`
  under pg_cron (with the `cron.job_run_details` retention job, as the email cron does) — trends across terms,
  totals that survive project deletion.
- `assignments.original_close_date` or an `assignment_deadline_changes` log, so reopening does not rewrite
  timeliness; `"TSRs".updated_at` so edits are visible.
- `events` table for product events the schema does not record.
- A weekly instructor digest through the email outbox (`kinds.py`, preference category required).
- Vercel Web Analytics on the frontend project.

## 11. Ambiguities to resolve — the questions that change the numbers

Each item: the question, why it matters, and the default this spec assumes if it goes unanswered.

### Scope and access
1. **Who sees a university's dashboard?** Instructors of that school, maintainers, department staff, TAs?
   Decides authorization and whether an admin concept is needed. *Default:* D1.
2. **Internal page or a public per-university page** (a `grepthink2.com/ucsc` showcase)? Public means
   anonymous access, caching and a much stricter privacy bar. *Default:* internal, signed in.
3. **Cross-class visibility.** May an instructor see other instructors' classes at the same school, in
   aggregate and per class? This is a data-sharing policy, not a technical choice. *Default:* yes, aggregate
   and per-class rows; per-team rows only inside a class they can already open.
4. **Class-level analytics for TAs** (an Insights tab on the class Dashboard / TA pages)? *Default:* not in v1;
   the class filter on the institution page covers instructors.

### Conversations
5. **Type-based exclusion only?** A DM between a student and their TA is a "team ↔ TA chat" in spirit. Exclude
   DMs where either party is a TA or the instructor of a class they share? *Default:* no; exclude by
   conversation type only, as requested.
6. **How a DM gets a school.** Shared-class rule (D4), the sender's `edu_email` domain, or exclude DMs from
   per-school totals? *Default:* shared-class rule, most recent class.
7. **Messages, conversations or people?** "Total messages" hides whether 3 or 100 people talk. Add distinct
   senders and active conversations? *Default:* messages only (both extras are one-line additions).
8. **Hidden conversations.** A participant's `conversation_deletes` hides a thread for them; its messages still
   happened. Count them? *Default:* count.
9. **Deleted projects.** Their channels and messages vanish with them (#197). Should totals be frozen before
   deletion (phase 2 rollup)? *Default:* no; totals reflect the live database.

### Scrum board
10. **Sprint alignment:** ordinal within each team (D5), calendar week, or matching sprint names? *Default:*
    ordinal.
11. **Backlog** as its own row in the live snapshot? *Default:* yes, first.
12. **Archived stories' tasks** in the snapshot? *Default:* excluded from the snapshot, included in "created".
13. **What counts as the text of a task or story:** title + description, description only, markdown stripped,
    comments included? *Default:* title + description as typed.
14. **Median, mean or both;** quartiles? *Default:* both; bars show the median.
15. **Normalize by team size or class size?** Raw totals favour big classes. *Default:* raw totals plus per-team
    columns in the breakdown.
16. **Counts or story points?** *Default:* counts; points are optional and uneven across teams.
17. **PR linkage as a metric** (tasks with a linked, merged PR) — not asked, but the strongest signal of real
    work on the board. *Default:* not in v1.
18. **"Created" vs "active":** a team that created 40 tasks in week 1 and never moved one looks busy. Add
    tasks moved (`task_moves`) in the window? *Default:* not in v1.

### Timeliness
19. **The deadline instant.** End of `close_date` in the school's zone (D7), or 11:59 PM Pacific for everyone
    (what the student UI shows today)? İstinye is 10–11 hours ahead. *Default:* school's zone.
20. **Submission time of a TSR:** first row, last row, or the moment every teammate is covered? *Default:*
    first row.
21. **Edits.** TSR rows have no `updated_at`; a student who submits early and rewrites late is "early". Add
    `updated_at` and report edit timeliness? *Default:* no.
22. **Reopened assignments.** Reopening overwrites `close_date`, so the original deadline is lost and late
    submitters look on time. Keep the original deadline (phase 2)? *Default:* current `close_date`; flagged in
    the card's definition popover.
23. **Expected submitters.** Current members (D7) or members at the deadline; students who joined late;
    teams of one? Membership history does not exist. *Default:* current members; TSR teams need ≥ 2 members.
24. **Interest forms** have no `assignment_id`. Match by class and the assignment's date window, or treat the
    interest form as class-level (one per class)? *Default:* date-window match, else the class's latest.
25. **Late is nearly impossible through the UI** (the web client locks the form after `close_date`; the API
    does not). The metric is therefore mostly on-time vs missing plus how early. Should the app accept late
    submissions and mark them late, which is the richer dataset but a policy change? *Default:* unchanged.
26. **Bucket edges.** Early = more than 24 h before? Also 48 h / 72 h? *Default:* 24 h; the SQL takes the edge
    as a constant to change in one place.
27. **Per student or per team?** The class Dashboard counts "teams submitted" (any member). *Default:* per
    expected submitter; team-level is derivable in the breakdown.
28. **Feedback assignments:** expected = enrolled students only, or TAs too (today's class Dashboard counts
    every enrollment)? *Default:* students only.

### Time, terms and history
29. **Do trends across terms matter** ("is Fall 2026 more active than Spring 2026")? If yes, the nightly
    rollup (D3) ships in v1 and term comparisons become a card. *Default:* no rollup; "term" is a filter.
30. **Freeze numbers at term end?** Deletions and late edits change the past otherwise. *Default:* live.
31. **Term identity.** `classes.term` and `year` are free text (`"Fall"`, `"fall 2026"`, …). Standardize the
    values (a constraint or a picker) so grouping is reliable? *Default:* group by the pair as entered.
32. **Week boundaries:** Monday in the school's zone? *Default:* yes.

### Privacy and policy
33. **Minimum group size** before a per-class or per-team row is shown (k-anonymity)? A class with one team
    exposes that team. *Default:* none; no per-student rows anywhere.
34. **Will students ever see any of this** (their team vs the class median)? Changes the authorization model
    and the suppression question. *Default:* no.
35. **Research use / FERPA.** Is any of this data meant for research or external sharing (the Jev evaluation
    raised FERPA sign-off)? *Default:* internal operations only; no export beyond the breakdown CSV.
36. **Retention of derived data.** Nothing new is stored in v1. If the rollup or an events table comes,
    how long is it kept? *Default:* not applicable in v1.

### Product and infrastructure
37. **Product events the schema does not record** — logins, board views, message reads, TSR edits, invite
    acceptance. Which of them matter enough to start an `events` table? *Default:* none in v1.
38. **Page views** (Vercel Web Analytics, free, no custom events on Hobby): enable it? *Default:* recommend
    yes, separately.
39. **Alerts and digests** (weekly instructor email with the on-time rate and quiet teams) via the outbox?
    *Default:* later.
40. **Export depth.** CSV of the breakdown table, or a full per-assignment export for a spreadsheet model?
    *Default:* breakdown CSV.
41. **Freshness.** 60 s server cache plus a manual refresh — enough, or should the live snapshot card refresh
    on its own? *Default:* 60 s auto-refresh while the tab is visible.

## 12. Open follow-ups

- Claude Design round for `components/analytics/` (brief in `docs/superpowers/handoffs/`); the kit's NOTES.md
  may change the layout choices in brief §9.
- `supabase/schema.sql` does not yet reflect institutions, conversation participants or the email outbox; the
  analytics functions will be added to it once applied, as AGENTS.md requires.
- PROD volume was not measured (production-read policy); measure it when applying the migration and record
  the counts in the migration's Check block.
