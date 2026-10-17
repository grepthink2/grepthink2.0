<p align="center">
  <a href="https://grepthink2.com"><img src="design/assets/grepthink-logo.svg" alt="GrepThink" width="420"></a>
</p>

<p align="center">
  <a href="https://github.com/grepthink2/grepthink2.0/actions/workflows/test.yml?query=branch%3Amain"><img alt="Tests on main" src="https://github.com/grepthink2/grepthink2.0/actions/workflows/test.yml/badge.svg?branch=main"></a>
  <a href="https://codecov.io/gh/grepthink2/grepthink2.0"><img alt="Coverage" src="https://codecov.io/gh/grepthink2/grepthink2.0/branch/main/graph/badge.svg"></a>
  <a href="https://grepthink2.com"><img alt="grepthink2.com deployment" src="https://img.shields.io/github/deployments/grepthink2/grepthink2.0/Production%20%E2%80%93%20grepthink2-0-frontend?label=grepthink2.com&logo=vercel&logoColor=white"></a>
  <a href="https://api.grepthink2.com/health"><img alt="api.grepthink2.com deployment" src="https://img.shields.io/github/deployments/grepthink2/grepthink2.0/Production%20%E2%80%93%20grepthink2-0-backend?label=api.grepthink2.com&logo=vercel&logoColor=white"></a>
</p>

**GrepThink** is team-project management for software-engineering courses. Students form project
teams and submit team self-reviews; TAs run the weekly meetings and review the submissions;
instructors run classes, rosters and staffing. It is the platform behind UC Santa Cruz's CSE 115
series, the v2 rebuild of [grepthink.com](https://www.grepthink.com), and it is live at
[grepthink2.com](https://grepthink2.com).

## What it does

- **Classes and rosters:** instructors create a class under their school, import a roster,
  invite students and designate TAs. One account can hold a different role in each class.
- **Projects and teams:** students create or join project teams, and instructors can assign them.
- **Reviews:** team self-reviews (TSRs) and assignments that TAs review, plus end-of-quarter
  final reviews.
- **TA meetings and attendance:** each project has a weekly meeting run by its TA.
- **Scrum board** for every project: sprints, user stories, tasks, burnup charts, comments and
  pull-request links.
- **Messaging:** direct and group conversations, in-app notifications, and email (reminders and
  digests that people can turn off).

## The repository

| Path | What | Docs |
|---|---|---|
| `frontend/` | React 19, TypeScript and Vite, styled with SCSS | [frontend/README.md](frontend/README.md) |
| `backend/` | FastAPI on Supabase (Postgres), through the service role | [backend/README.md](backend/README.md) · [style guide](backend/STYLE_GUIDE.md) · [API for the frontend](backend/docs/FRONTEND_API.md) |
| `backend/database/migrations/` | SQL applied by hand, one folder per month | [DEPLOY.md](DEPLOY.md), "Database migrations" |
| `supabase/` | schema snapshot, auth and storage setup for a fresh database | [supabase/README.md](supabase/README.md) |
| `design/` | the Claude Design export (the design system), ported into `frontend/` by hand | [design/PORTING.md](design/PORTING.md) |
| `docs/superpowers/specs/` | design records for the larger features, cited from code | |
| `.github/` | CI workflow, Dependabot, the pull-request template and the branch rulesets | "Tests and checks" and "Branches" below |

Start with [AGENTS.md](AGENTS.md): architecture, roles, conventions, and the gotchas that bite.
[AUTH.md](AUTH.md) covers sign-in and authorization. [DEPLOY.md](DEPLOY.md) covers Vercel,
environment variables, migrations, email delivery and error tracking.
[CODE_REVIEW.md](CODE_REVIEW.md) is the April 2026 code review that comments in the code cite by
number.

## Running the dev servers

Two processes. The frontend proxies `/api` to the backend, so **start the backend first**.
Otherwise the UI loads but every request fails until the backend is up.

### One-time setup

You need Node 24 (pinned in `.nvmrc`) and Python 3.12 or newer. CI runs 3.12.

Copy the environment template to the repo root and fill it in. Both halves read only that one
file (see Nuance 1):

```bash
cp .env.example .env
```

The required values are the Supabase project's `SUPABASE_URL`, `SUPABASE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` (or `SUPABASE_JWK_JSON`) for the backend,
and `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the frontend. Point them at the DEV
project. Everything else is optional (email, Sentry, the scrum board's GitHub token, and so on),
and the template explains each one.

Then install both halves:

```bash
npm --prefix frontend ci
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
```

### Start

Terminal 1, the backend (http://localhost:5001, API docs at `/docs`):

```bash
cd backend && .venv/bin/python run.py
```

Terminal 2, the frontend (http://localhost:5173):

```bash
npm --prefix frontend run dev
```

### Stop and restart

Press `Ctrl-C` in each terminal. If a process is orphaned and the port stays bound:

```bash
lsof -nP -iTCP:5173 -iTCP:5001 -sTCP:LISTEN
kill $(lsof -t -iTCP:5001 -sTCP:LISTEN) $(lsof -t -iTCP:5173 -sTCP:LISTEN)
```

Both servers hot-reload, so you rarely need a restart. Restart when:

- the root `.env` changes, because neither server watches it;
- `frontend/vite.config.ts` changes (proxy, aliases, env config);
- `backend/run.py` changes, because uvicorn's reloader only watches `backend/app/`;
- dependencies change, or you switch branches across a dependency change (re-run
  `npm --prefix frontend ci`).

## Nuances that bite

1. **Only the repo-root `.env` is read.** `frontend/.env` and `backend/.env` are inert: Vite sets
   `envDir: '..'`, and `backend/app/config.py` resolves `<repo root>/.env`. A missing root `.env`
   shows up as `Missing Supabase configuration` in the browser console and as
   `ValueError: SUPABASE_URL must be set` from the backend.

2. **Know which Supabase project you're pointed at.** DEV and PROD are separate projects with
   separate user tables. An account that works on the deployed site may not exist locally, or may
   have a different password there.

   ```bash
   grep -m1 SUPABASE_URL .env
   ```

3. **A dev server serves the directory it was launched from, so verify it, especially with git
   worktrees.** The backend logs `Will watch for changes in these directories: [...]` at startup.
   For the frontend, the served module carries its absolute path:

   ```bash
   curl -s http://localhost:5173/src/main.tsx | grep -o '/Users/[^"]*main.tsx'
   ```

   Each worktree needs its own root `.env` (it is gitignored, so it doesn't come along with the
   checkout) and its own `frontend/node_modules`.

4. **The virtualenv doesn't have to live in the worktree you're running.** It only supplies the
   interpreter and packages; the code comes from the working directory. From a worktree's
   `backend/`, another checkout's venv works fine:

   ```bash
   /path/to/other/checkout/backend/.venv/bin/python run.py
   ```

5. **In dev the client ignores `VITE_API_URL`.** `frontend/src/lib/api/client.ts` uses
   same-origin requests and the Vite proxy whenever `import.meta.env.DEV` is true. To retarget
   `/api`, edit the proxy target in `frontend/vite.config.ts`, or use `dev:prod` below.

## Customization

**Ports.** Frontend: `npm --prefix frontend run dev -- --port 5174`. Backend:
`PORT=5002 .venv/bin/python run.py` (the shell's environment wins over `.env`). If you move the
backend, update the `/api` proxy target in `frontend/vite.config.ts` to match, or the frontend
keeps talking to 5001.

**Phone and LAN testing.** `server.host` is already `true`, so Vite prints a `Network:` URL
alongside the local one. Add that origin to `CORS_ORIGINS` in `.env` so the backend accepts its
requests.

**Run the UI against the deployed API** (no local backend needed):

```bash
npm --prefix frontend run dev:prod
```

This proxies `/api` to `https://api.grepthink2.com`. ⚠️ It only works if the root `.env`'s
`VITE_SUPABASE_*` point at the **same** Supabase project the deployed API validates against.
Otherwise you sign in to one project, send that token to an API checking another, and every call
answers 401.

**Bind the backend to localhost only:** `HOST=127.0.0.1 .venv/bin/python run.py`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Console: `Missing Supabase configuration` | no root `.env` | create it at the repo root, not in `frontend/` |
| Backend: `ValueError: SUPABASE_URL must be set` | same | same |
| UI loads, every API call fails | backend down, or on another port | start it; check the proxy target |
| A known-good login is rejected | pointed at the other Supabase project | check `SUPABASE_URL` (Nuance 2) |
| Edits don't appear | server launched from a different worktree | verify per Nuance 3 |
| `EADDRINUSE` on start | orphaned process holding the port | kill by port (above) |
| Blank page or import errors after a branch switch | stale dependencies | `npm --prefix frontend ci` |

## Tests and checks

CI ([`.github/workflows/test.yml`](.github/workflows/test.yml)) runs these on every pull request
into `beta` or `main`, and again on the merge commit. Run them before you push:

```bash
# frontend
npm --prefix frontend run build && npm --prefix frontend run lint && npm --prefix frontend run lint:design && npm --prefix frontend run test:coverage
# backend
cd backend && .venv/bin/ruff format --check . && .venv/bin/ruff check . && .venv/bin/python -m pytest --cov
```

Both suites measure coverage. The build fails below the thresholds in
[`frontend/vite.config.ts`](frontend/vite.config.ts) (`coverage.thresholds`) and
[`backend/.coveragerc`](backend/.coveragerc) (`fail_under`). Raise them as coverage grows; never
lower them to get a build through. CI writes the numbers to the run's summary, keeps the reports
as artifacts for two weeks, and uploads them to Codecov for the badge above.

`npm test` at the repo root runs both test suites without coverage; it uses `backend/.venv` when
it exists.

## Branches, releases and the database

- Work on a feature branch and open a pull request into `beta`. Fill in the template: what
  changed, how you verified it, which gates ran.
- Nothing lands on `main` except a pull request from `beta` whose checks pass, merged with a
  merge commit; squashing it leaves the two branches in conflict. Vercel deploys `main` to
  production. [`.github/rulesets/`](.github/rulesets/) holds this policy as GitHub rulesets
  (`main.json`: pull requests only, both CI jobs required, merge commits only, no force-push or
  deletion; `beta.json`: no force-push or deletion), importable from the repository's Settings →
  Rules.
- Dependabot opens grouped dependency updates against `beta` once a week
  ([`.github/dependabot.yml`](.github/dependabot.yml)).
- Merging never changes a database. Add a migration as
  `backend/database/migrations/<YYYY-MM>/<YYYY-MM-DD>_<name>.sql`, apply it by hand to DEV, and
  apply it to PROD before the release whose code needs it ([DEPLOY.md](DEPLOY.md), "Database
  migrations"). Update `supabase/schema.sql` once it is applied; CI leaves a warning on a pull
  request that adds a migration without touching the snapshot.
- Implementation plans stay local (`docs/superpowers/plans/` is gitignored). Open work goes in
  GitHub issues.

## Security

Found a vulnerability? Report it privately, as [SECURITY.md](SECURITY.md) describes, rather than
in a public issue.
