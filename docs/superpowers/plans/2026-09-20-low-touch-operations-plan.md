# Low-touch operations plan — deploys, observability, student bug intake

Date: 2026-09-20. Status: **plan only, nothing here is built.** Written for a maintainer who
will look at this project a few hours a month. Every finding below was measured on
2026-09-20 against the repo, GitHub, Vercel's env inventory and both Supabase projects; the
evidence is inline so it can be re-checked.

The organising idea for all three parts is the same: **stop relying on anyone remembering
things.** Today a release depends on remembering to run SQL by hand, remembering which branch
merges how, and remembering to look at dashboards. Each part replaces a memory with a
mechanism.

## Do these first

| # | What | Why now | Effort | Cost |
|---|------|---------|--------|------|
| 1 | Run `backend/database/migrations/prod/2026-09-20_align_prod.sql` on PROD | PROD is 3 migrations behind dev and realtime is dead there; gates beta → main | 10 min | — |
| 2 | Back up PROD, then automate it | **PROD is on Supabase's free plan: there are no backups.** 1,419 TSRs, attendance and final-review scores are one bad `UPDATE` from gone | 1–2 h | $0, or $25/mo for Pro |
| 3 | Add PROD to the keep-alive ping | Free projects pause after ~7 idle days; the workflow pings dev only, so PROD will go dark over a break | 5 min | — |
| 4 | Branch rulesets on `main` and `beta` | Public repo, **no protection of any kind**; a push to `main` is a production deploy | 15 min | — |
| 5 | Run CI on `main` and on PRs into `main` | The release PR currently runs **zero** tests | 5 min | — |
| 6 | Release with merge commits, never squash | The squash is what manufactures the beta ↔ main conflicts (11 files today) | 30 min once | — |
| 7 | Error tracking with alerts (Sentry) | Turns "read logs" into "get told"; PROD emits no app logs below WARNING anyway | 2–3 h | $0 |

Items 1–6 need no new code. Everything after that is in the three parts below.

---

## Part 1 — Deployment workflow (beta → main → Vercel)

### What happens today

```
feature ──squash──▶ beta ──squash──▶ main ──Vercel git integration──▶ Production
   CI on PR            CI on push       no CI            two projects, no checks after
                                        SQL applied by hand, if someone remembers
```

### Gaps, worst first

**1.1 No backups, and PROD can pause.** `get_organization` → `plan: free`. Free tier has no
daily backups and no point-in-time recovery, and pauses idle projects. `supabase-keepalive.yml`
reads `SUPABASE_KEEPALIVE_URL`, which is the dev project. *Fix:* add a second ping for PROD
now. For backups choose one: upgrade to Pro for the quarters the course runs (daily backups,
7 days), or a nightly GitHub Action that runs `pg_dump`, encrypts it with `age` to a key only
you hold, and uploads it to a private bucket — student evaluations must not sit unencrypted in
CI artifacts. Either way, do one restore drill so the backup is known to work.

**1.2 Nothing protects `main`.** `GET /branches/main/protection` → 404, `GET /rulesets` → `[]`,
repo visibility `public`. Anyone with write access can push or force-push straight to
production. *Fix:* one ruleset for `main` and `beta`: require a PR, require the `Frontend
(Vitest)` and `Backend (pytest)` checks, block force-push and deletion. On `main` additionally
allow **merge commits only** (see 1.4).

**1.3 The release PR is untested.** `test.yml` triggers on `push`/`pull_request` for
`branches: [beta]` only, and its header says main is "intentionally excluded". A PR from
`beta` into `main` therefore runs nothing; the Vercel build is the only signal, and "it
compiled" is not "it works" — all the more because conflict resolution happens on exactly that
PR. *Fix:* `branches: [beta, main]` on both triggers.

**1.4 Squash-merging releases manufactures conflicts.** `main`'s tip `69d2421` is a squash of
`beta`'s `2d48d85`: `git diff 69d2421 2d48d85` is **empty**, yet the merge base is still
`3c7982d`, because a squash has no parent link to `beta`. Git therefore re-litigates every file
both sides touched since then, on every release — 11 conflicted files today, and the "Merge
main into beta: resolve deploy-PR conflicts" commit is the scar from last time. *Fix:* squash
feature → `beta` if you like; **`beta` → `main` must be a merge commit** so `main` stays an
ancestor of `beta`. One-time repair: merge `main` into `beta` (take `beta`'s side everywhere —
the content is identical), then release. After that, release PRs never conflict.

**1.5 Migrations are manual, unrecorded and unordered.** Measured drift on 2026-09-20: PROD was
missing `group_messaging` (2 months), the `handle_new_user` fix (3 months) and the perf
migration; its realtime publication was empty, which no file ever captured; PROD carried a
guard (`rls_auto_enable`) that existed in no file. There are three competing sources of truth:
`backend/database/migrations/*.sql` with hand-typed "Applied:" headers, Supabase's own
migration history (only populated when the MCP tool is used), and the `supabase/schema.sql`
dump. `supabase/README.md` still describes a "fresh-build, no migrations" model and a
June table inventory. *Fix, in order:*
  - Adopt Supabase CLI migrations: move the files to `supabase/migrations/<timestamp>_<name>.sql`,
    baseline both projects with `supabase migration repair` so history matches reality.
  - A `migrate` job: on push to `beta` → `supabase db push` to dev; on push to `main` → to PROD,
    behind a GitHub Environment with you as required reviewer. One click on your phone,
    recorded, ordered, and impossible to forget.
  - A weekly **drift check** (`supabase db diff --linked` against both) that opens an issue
    when it finds anything. This one job would have caught everything in this section.
  - Until then, keep using the rule in `DEPLOY.md`: additive changes ship a release *before*
    the code that needs them; drops ship a release *after*.

**1.6 Deploy and migration race.** Vercel deploys `main` the moment it is pushed; a migration
job would run in parallel. *Fix:* either keep strict expand/contract (1.5), or turn off Vercel's
automatic production deploys and trigger them from the workflow with a Deploy Hook after
`migrate` succeeds — a single ordered pipeline: test → migrate → deploy → smoke.

**1.7 There is no staging.** Vercel builds a preview for every branch, but all env vars are
scoped to Production, so previews cannot sign in. `beta` is a branch that runs nowhere; `main`
is the first time code meets real infrastructure. *Fix:* give both Vercel projects
Preview-scoped variables pointing at the **dev** Supabase project, pin stable branch domains
(`beta.…` and `api-beta.…`), add those to the backend's preview `CORS_ORIGINS` and to the dev
project's Auth redirect URLs. Then `beta` is staging, and every PR has a clickable preview —
which Part 3 depends on.

**1.8 Nothing checks a deploy worked.** `/health` returns a constant
(`{"status": "healthy"}`), so it stays green with wrong credentials or a paused database, and the
smoke test in `DEPLOY.md` is manual. *Fix:* add `/health/ready` — one cheap DB read, a check
that the JWT verification key is configured, and the commit SHA from `VERCEL_GIT_COMMIT_SHA`.
A workflow on GitHub's `deployment_status` event curls it for both projects, waits until both
report the new SHA (the two projects deploy independently, so there is a skew window), and
opens an issue if it fails. Show the SHA in the app footer too.

**1.9 Two features silently do not work on serverless** (already in `DEPLOY.md`): the rate
limiter counts per instance and keys on the proxy's address; the scheduled-invite poller lives
in the FastAPI lifespan, so queued invites send late or never. *Fix:* rate limit on
`X-Forwarded-For` in a shared store (Upstash free tier); move the poller to Vercel Cron calling
an endpoint guarded by `CRON_SECRET`, with a dead-man's-switch ping (Part 2).

**1.10 Pinned dependencies with nothing updating them.** The refactor pinned everything, which
is right for reproducible builds and wrong if nobody bumps them. *Fix:* Dependabot for `pip`,
`npm` and `github-actions`, weekly, minor and patch grouped into one PR each. CI makes those
PRs safe to merge from a phone.

### Target pipeline

```
feature ─PR, squash─▶ beta ─────────────────release PR, MERGE COMMIT─────────────▶ main
  CI required          CI · migrate dev · deploys to staging (dev DB)     CI required
                                                                          migrate PROD (1 approval)
                                                                          deploy both projects
                                                                          smoke: /health/ready × 2, SHA match
                                                                          failure → issue + `vercel rollback`
```

---

## Part 2 — Observability without always-on logging or tracing

The modern answer is to invert the direction. Logs and traces are **pull**: they are only
useful if someone goes looking, continuously, and they cost money and attention whether or not
anything is wrong. A low-touch project wants **push**: silence when healthy, one message when
not, and enough context in that message to act without reproducing anything. Concretely, four
signals replace the log stream:

**2.1 Errors, not logs — Sentry (free tier: 5k errors/month).** Backend and frontend SDKs.
It records nothing until something throws, then captures the stack, request, release and
breadcrumbs, groups duplicates, and alerts on *new* issue, *regression* and *spike*. The
refactor already did the hard part: every failure has a stable `code`
(`database_read_failed`, `database_unavailable`, `internal_error`, …). Use it as the Sentry
fingerprint and tag; report `DatabaseError` and unhandled 500s, never 4xx. In the client,
report from the existing `ErrorBoundary` and on `ApiError` with status ≥ 500. Turn on **replay
only on error** (`replaysOnErrorSampleRate: 1`, session rate `0`) with all text and inputs
masked — you see what the student clicked before the crash without recording anyone
routinely. Tie releases to `VERCEL_GIT_COMMIT_SHA` so each issue names the commit that
introduced it.

> Context: `configure_logging()` is never called on `main`, `beta` or this branch, so the
> file-logging module is dead code, PROD emits nothing below WARNING, and if it *were* called
> it would try to create `backend/logs` on a read-only filesystem. Replace it with a small
> stdout JSON config. Do not try to make file logs work on Vercel.

**2.2 Synthetic checks, not traces.**
  - *Uptime:* an external monitor (UptimeRobot or Better Stack, free) on `/health/ready` and the
    frontend, every 5 minutes.
  - *A canary user journey:* a scheduled GitHub Action runs a Playwright script against PROD
    with a dedicated canary account — sign in, load classes, open one, open the inbox. This
    catches a paused database, a broken key, a bad env var or a deploy that broke login, which
    no log line would tell you. Failure opens or updates one issue.
  - *Heartbeats for jobs:* once the invite poller is a cron, it pings healthchecks.io on
    success; silence raises the alert.

**2.3 Diagnostics on demand, not all the time.**
  - A **request id** per request: generated in middleware, returned as `X-Request-ID`, included
    in every error body, and shown to the user ("Error ref 7f3a…"). That one id joins a
    student's report, the Sentry event and the Vercel log line.
  - **One structured line per bad request only** — emitted when a request fails or takes over
    ~2 s: route, role, duration, status, `code`, and database round trips (the `DatabaseClient`
    proxy in `app/core/db.py` already sees every `.execute()`, so counting them is a few lines).
    This is tail sampling done in the app: full detail for the 1% you care about, nothing for
    the rest.
  - A **debug switch:** `LOG_LEVEL` for a whole deployment, or an `X-Debug-Trace` header
    honoured only for instructor tokens, to get verbose output for one request when you are
    actively investigating.

**2.4 A weekly digest written by an agent.** The dashboards you already have for free — Vercel
Observability and Speed Insights, Supabase Reports and its security and performance advisors —
are only useful if someone reads them. Have a scheduled agent read them instead (a Claude Code
scheduled routine, or a GitHub Action on a cron) and open **one** issue a week containing only
what needs a decision: new or regressed Sentry issues, advisor findings, dev ↔ PROD schema and
migration drift, `npm audit` / `pip-audit` results, open Dependabot PRs, failed deploys, and
free-tier headroom (database size, MAU, days since PROD's last activity). Give it read-only
credentials. Trivial findings can come with a PR attached. You read one page a week.

**Alert routing.** Two tiers, one channel (email plus a Discord or Slack webhook). *Interrupt
me:* uptime down, canary failing, error spike. *Digest:* everything else. A low-touch
maintainer who gets noisy alerts stops reading them, so this matters more than which tools you
pick.

| Signal | Tool | Cost |
|---|---|---|
| Exceptions, replay-on-error, release tracking | Sentry | free |
| Uptime | UptimeRobot / Better Stack | free |
| Canary journey, drift check, digest | GitHub Actions (public repo) | free |
| Job heartbeats | healthchecks.io | free |
| Backups | Supabase Pro, or encrypted `pg_dump` | $25/mo, or ~$0 |

---

## Part 3 — Students report a bug → an issue → a pull request

### The flow

```
student ──▶ report ──▶ GitHub issue ──▶ triage (agent, read-only) ──▶ YOU add `agent:fix`
                                                                            │
   in-app "fixed, thanks" ◀── deploy ◀── you merge ◀── CI + preview ◀── agent opens PR onto beta
```

### Phases

**Phase 0 — an afternoon, no backend.** Every student in this course has a GitHub account. Add
an issue form (`.github/ISSUE_TEMPLATE/bug_report.yml`: what happened, what you expected,
steps, screenshot) and a "Report a problem" link in the help menu, the error toast and the
`ErrorBoundary` screen that opens the form prefilled with **non-personal** context only: route
template, commit SHA, request id, browser. Labels `student-report` and `needs-triage`. This is
most of the value for almost none of the work.

**Phase 1 — the fix agent, behind a human gate.** A workflow runs the Claude Code GitHub
Action when a maintainer applies the `agent:fix` label (or comments `@claude`). It reads the
issue and triage notes, writes a failing test first, fixes, runs the same gates as CI, and
opens a PR onto `beta` that links the issue and states root cause and evidence. This repo is
unusually well prepared for it: `AGENTS.md` and `backend/STYLE_GUIDE.md` already tell an agent
how to work here, and the backend suite runs against a fake Supabase, so the agent needs **no
secrets** to prove a fix.

**Phase 2 — a triage agent with no write access.** On `issues: opened`: classify, search for
duplicates, link the Sentry issue by request id, attempt a reproduction against staging, and
post one triage comment proposing labels. Read-only token, no secrets.

**Phase 3 — an in-app form, if Phase 0 proves too public.** `POST /api/feedback/bug`
(authenticated, rate-limited per user, de-duplicated by fingerprint) files the issue through a
**GitHub App** with `issues: write` only — not a personal token. The reporter's identity goes
in a `bug_reports` table, never in the issue, which also lets the app tell the student when
their report ships. Because the repo is public, file raw reports into a **private triage repo**
and promote sanitised ones.

### The part that must not be skipped: this is an agent with write access, fed text written by strangers, on a public repo

  - **Student text is untrusted input and can carry instructions.** So the fix agent never
    runs on it automatically — only after a maintainer's label. That human gate is the control;
    everything below is defence in depth. Wrap the reporter's text in a clearly delimited block
    and tell the agent it is data.
  - **Only people with write access can trigger it.** Confirm the action's actor-permission
    check when implementing, and use the `issues` / `issue_comment` events, which run the
    workflow file from the default branch rather than one a PR could have edited.
  - **The agent cannot touch what could hurt you.** Rulesets from 1.2 stop it pushing to
    `beta` or `main`. A CI check (or push rule) fails any bot PR that edits `.github/**`,
    `backend/database/migrations/**`, `supabase/**`, `**/vercel.json` or `.env*`.
  - **No production secrets in its environment**, and never auto-merge.
  - **Bound the cost:** one run per issue at a time, a timeout, a daily cap, and a monthly API
    budget. Expect a few dollars per attempted fix.
  - **Sentry is a second intake.** Its GitHub integration can open issues for new crashes, which
    then flow through the same triage and gate — many bugs will arrive with a stack trace
    before any student reports them.

### What it depends on

Part 3 is only safe on top of Part 1: branch rulesets (so the agent can only propose),
working previews (so you can review from a phone), and CI on every PR. It is only *useful* on
top of Part 2: request ids and commit SHAs are what turn "it broke" into a reproducible report.

---

## Suggested order

1. **This week (≈ half a day):** the table at the top — align PROD, a backup, keep-alive for
   PROD, rulesets, CI on `main`, the one-time merge repair.
2. **Next (≈ 1 day):** Sentry on both halves with `code` fingerprints and replay-on-error;
   request ids; `/health/ready` with the SHA; uptime monitor; Dependabot.
3. **Then (≈ 1–2 days):** Preview env vars and branch domains (staging); Supabase CLI
   migrations with the `migrate` job and the drift check; post-deploy smoke.
4. **Then (≈ 1 day):** issue form + prefilled link (Phase 0); the gated fix agent (Phase 1).
5. **Later, as needed:** canary journey, weekly digest, triage agent, invite poller to cron,
   shared rate-limit store, in-app report form.

## Decisions only you can make

- **Supabase Pro ($25/mo) or self-managed encrypted dumps?** Pro is less to maintain; dumps are
  free but are one more thing that can silently stop.
- **Public issues or a private triage repo** for student reports? Public is simpler; private is
  kinder to students who paste something they should not have.
- **Who may apply `agent:fix`?** Just you, or TAs too?
- **Release cadence.** A weekly `beta` → `main` train is easy to reason about; on-demand is
  fine if rulesets and smoke tests are in place.
- **Where alerts go** — the one channel you will actually read.
