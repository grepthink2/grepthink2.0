# grepthink2.0

Welcome to Grepthink 2.0

Monorepo:

| Path | Stack | Docs |
|---|---|---|
| `frontend/` | React 19 + TypeScript + Vite, SCSS | [frontend/README.md](frontend/README.md) |
| `backend/` | FastAPI + Supabase (service-role) | [backend/README.md](backend/README.md) · [Developer guide](backend/docs/DEVELOPER_GUIDE.md) |

Deployment: [DEPLOY.md](DEPLOY.md).

## Running the dev servers

Two processes. The frontend proxies `/api` → the backend, so **start the backend first** — otherwise the UI loads but every request fails until the backend is up.

### One-time setup

The repo-root `.env` is gitignored and **both halves read only that one file** (see Nuance 1). Create it at the repo root with:

```
SUPABASE_URL=              # backend: project URL
SUPABASE_KEY=              # backend: anon key
SUPABASE_SERVICE_ROLE_KEY= # backend: bypasses RLS — never expose to the client
SUPABASE_JWT_SECRET=       # backend: verifies access tokens (or SUPABASE_JWK_JSON)
SUPABASE_JWK_JSON=
VITE_SUPABASE_URL=         # frontend: same project as SUPABASE_URL
VITE_SUPABASE_ANON_KEY=    # frontend: anon key
VITE_API_BASE_URL=         # ignored in dev (see Nuance 5)
# optional: CORS_ORIGINS, HOST, PORT, SMTP_*
```

Then install both halves:

```bash
npm --prefix frontend ci
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

### Start

Terminal 1 — backend (http://localhost:5001, docs at `/docs`):

```bash
cd backend && .venv/bin/python run.py
```

Terminal 2 — frontend (http://localhost:5173):

```bash
npm --prefix frontend run dev
```

### Stop and restart

`Ctrl-C` in each terminal. If a process is orphaned and the port stays bound:

```bash
lsof -nP -iTCP:5173 -iTCP:5001 -sTCP:LISTEN
kill $(lsof -t -iTCP:5001 -sTCP:LISTEN) $(lsof -t -iTCP:5173 -sTCP:LISTEN)
```

Both servers hot-reload, so a restart is rarely needed. Restart when:

- the root `.env` changes — neither server watches it;
- `frontend/vite.config.ts` changes (proxy, aliases, env config);
- `backend/run.py` changes — uvicorn's reloader only watches `backend/app/`;
- dependencies change, or you switch branches across a dependency change (re-run `npm --prefix frontend ci`).

## Nuances that bite

1. **Only the repo-root `.env` is read.** `frontend/.env` and `backend/.env` are inert — Vite sets `envDir: '..'` and `backend/app/config.py` resolves `<repo root>/.env`. Symptoms of a missing root `.env`: `Missing Supabase configuration` in the browser console, and `ValueError: SUPABASE_URL must be set` from the backend.

2. **Know which Supabase project you're pointed at.** Dev and prod are separate projects with separate user tables — an account that works on the deployed site may not exist locally, or may have a different password there.

   ```bash
   grep -m1 SUPABASE_URL .env
   ```

3. **A dev server serves the directory it was launched from — verify it, especially with git worktrees.** The backend logs `Will watch for changes in these directories: [...]` at startup; for the frontend, the served module carries its absolute path:

   ```bash
   curl -s http://localhost:5173/src/main.tsx | grep -o '/Users/[^"]*main.tsx'
   ```

   Each worktree needs its own root `.env` (gitignored, so it does not come along with the checkout) and its own `frontend/node_modules`.

4. **The virtualenv does not have to live in the worktree you're running.** It only supplies the interpreter and packages; the code comes from the working directory. From a worktree's `backend/`, another checkout's venv works fine:

   ```bash
   /path/to/other/checkout/backend/.venv/bin/python run.py
   ```

5. **In dev the client ignores `VITE_API_BASE_URL`.** `frontend/src/lib/api.ts` uses same-origin requests plus the Vite proxy whenever `import.meta.env.DEV` is true. To retarget `/api`, edit the proxy target in `frontend/vite.config.ts` — or use `dev:prod` below.

## Customization

**Ports.** Frontend: `npm --prefix frontend run dev -- --port 5174`. Backend: `PORT=5002 .venv/bin/python run.py` (shell env wins over `.env`). If you move the backend, update the `/api` proxy target in `frontend/vite.config.ts` to match, or the frontend will keep talking to 5001.

**Phone / LAN testing.** `server.host` is already `true`, so Vite prints a `Network:` URL alongside the local one. Add that origin to `CORS_ORIGINS` in `.env` so the backend accepts its requests.

**Run the UI against the deployed API** (no local backend needed):

```bash
npm --prefix frontend run dev:prod
```

This proxies `/api` → `https://api.grepthink2.com`. ⚠️ It is only coherent if the root `.env`'s `VITE_SUPABASE_*` point at the **same** Supabase project the deployed API validates against. Otherwise you authenticate against one project and send that token to an API checking another, and every call 401s.

**Bind the backend to localhost only:** `HOST=127.0.0.1 .venv/bin/python run.py`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Console: `Missing Supabase configuration` | no root `.env` | create it at the repo root (not in `frontend/`) |
| Backend: `ValueError: SUPABASE_URL must be set` | same | same |
| UI loads, every API call fails | backend down, or on another port | start it; check the proxy target |
| A known-good login is rejected | pointed at the other Supabase project | check `SUPABASE_URL` (Nuance 2) |
| Edits don't appear | server launched from a different worktree | verify per Nuance 3 |
| `EADDRINUSE` on start | orphaned process holding the port | kill by port (above) |
| Blank page or import errors after a branch switch | stale dependencies | `npm --prefix frontend ci` |

## Tests

```bash
npm --prefix frontend run test
cd backend && .venv/bin/python -m pytest
```

The root `npm test` runs both, but its backend half looks for `backend/venv/` and falls back to the *system* `python3` when it doesn't find it — this checkout uses `backend/.venv/`, so that fallback usually fails on missing deps. Prefer the explicit commands above until the script is fixed.
