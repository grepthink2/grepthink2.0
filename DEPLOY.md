# GrepThink 2.0 — Deployment

Production runs on **Vercel** as two projects backed by the **PROD Supabase project**
(`yfezwtoeoexfksvbpxmi`, us-west-1). The earlier VM2 / systemd / nginx runbook was
retired on 2026-06-30 and its scripts removed from the repo; the Docker files
(`docker-compose.yml`, `frontend/Dockerfile` + `nginx.conf`, `backend/Dockerfile`)
remain as an optional self-host fallback.

| Half | Vercel project | Config | Entry point |
|---|---|---|---|
| Frontend | SPA | `frontend/vercel.json` (rewrite everything to `index.html`) | `npm run build` → `dist/` |
| Backend | Python serverless | `backend/vercel.json` (`@vercel/python`) | `backend/api/index.py` → `app.main:app` |

Merging to `main` deploys both projects. Nothing in this repo applies database
changes — see **Database migrations** below.

## Environment variables

Set these in each Vercel project (Settings → Environment Variables). The full list
with comments is in `.env.example` at the repo root; the same file is what local
development reads (only the repo-root `.env` is read — see `README.md`).

**Backend project**

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | PROD project URL |
| `SUPABASE_KEY` | anon key (used for the JWKS `apikey` header and as the RLS-bound fallback client) |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key — bypasses RLS; all authorization is enforced in the FastAPI controllers |
| `SUPABASE_JWT_SECRET` and/or `SUPABASE_JWK_JSON` | access-token verification (HS256 secret, or the project's JWK for ES256/RS256) |
| `CORS_ORIGINS` | comma-separated frontend origins; `*` is rejected |
| `FRONTEND_URL` | absolute URL used in transactional emails |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASSWORD` `SMTP_FROM` | invite / verification / contact emails |
| `PENDING_INVITES_POLL_SECONDS` | optional; scheduled-invite poll interval (default 5) |
| `SENTRY_DSN` | optional; turns on error reporting to Sentry (see **Error tracking**). Unset means off |

**Frontend project**

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | same PROD project as the backend |
| `VITE_SUPABASE_ANON_KEY` | anon key (public — it ships in the bundle) |
| `VITE_API_URL` | backend project origin (`https://api.grepthink2.com`); must also appear in the backend's `CORS_ORIGINS` |

Only `VITE_`-prefixed variables reach the browser bundle. Never add
`SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_JWT_SECRET` to the **frontend** project.

## Supabase dashboard (once per project)

`supabase/auth_glue.sql` §5 lists the dashboard steps a schema dump cannot capture:
the custom access-token hook, Auth **Site URL / redirect URLs** pointing at the Vercel
frontend domain, the Google provider, leaked-password protection, and the storage
buckets from `supabase/storage.sql`. After adding any new public table, re-run
`supabase/auth_glue.sql` so RLS is force-enabled on it.

## Database migrations

`backend/database/migrations/*.sql` are **staged scripts, not auto-applied
migrations**. Merging a migration changes nothing in the database. Before deploying
code that depends on a schema change:

1. Apply the file to the DEV project (`jfbagjjvryqcwxsyeyeg`) and run the app
   against it (`npm --prefix frontend run dev` + `backend/run.py`).
2. Apply the same file to PROD **before** the merge that deploys the code
   (expand/contract: additive changes first, drops only after the old code is gone).
3. Verify with a `SELECT` (or the Supabase advisors for index/RLS changes) and
   record the date in the migration's header comment.
4. Regenerate `supabase/schema.sql` from the repo root so the schema-as-code stays current:
   `scripts/supabase.sh dev db dump --linked --schema public -f supabase/schema.sql`. Always
   run the CLI through `scripts/supabase.sh` and never `supabase login`; AGENTS.md explains why.

**Through the Supabase connector.** An agent with the Supabase MCP connector can do steps 1–3
on dev and on PROD. `apply_migration` also records the file in the project's migration
history, which the SQL editor does not, and `execute_sql` runs the verification. The connector
works on both projects. In Claude Code's auto mode, a permission check judges each call and may
refuse PROD reads or writes. That is a setting: approve the call, or add an allow rule for the
connector's tools. A file that wraps several steps in its own `BEGIN … COMMIT` is safest pasted
whole into the SQL editor.

**Applied to PROD on 2026-09-23:** `backend/database/migrations/prod/2026-09-20_align_prod.sql`
(group messaging, the realtime publication, the `handle_new_user` fix, the perf migration, the
cleanup, the `.edu` verification table and the lockdown). It was verified the same day from a
dump: every check in its step 10 passes. PROD and dev now have the same schema. Do not re-run it:
after the role migration below, its step 3 would put the old `handle_new_user` back. Dev has had
steps 1–7 since 2026-09-20 and steps 8–9 since 2026-09-23.

**Applied to PROD on 2026-09-21, on its own:**
`backend/database/migrations/2026-09-21_lock_down_direct_table_access.sql`. Until then any
signed-in user on PROD could set their own `profiles.role` to `instructor` with the public anon
key. It is still the bundle's last step, because the group messaging step re-grants ALL on a
table PROD does not have yet; re-running it is harmless. Applied to dev on 2026-09-23.

**Only after `beta` is live on `main`:**
`backend/database/migrations/2026-09-21_role_chosen_by_its_owner.sql`. It is not an expand — the
code `main` runs today cannot finish a Google signup once it is applied — so it is deliberately
not in the bundle. Applied to dev on 2026-09-23.

PROD is on Supabase's free plan: there are **no backups** and an idle project pauses. Take a
dump before any PROD schema change. It needs Docker (Colima works), and the folder must stay
outside the repo because the dump holds student data:

```bash
D=~/grepthink-backups/prod-$(date +%F); mkdir -p "$D" && chmod 700 "$D"
scripts/supabase.sh prod db dump --linked --role-only -f "$D/roles.sql"
scripts/supabase.sh prod db dump --linked -f "$D/schema.sql"
scripts/supabase.sh prod db dump --linked --data-only --use-copy -f "$D/data.sql"
```

The data dump covers `public`, `auth` (users, identities) and `storage` metadata, not the stored
files. To restore, load roles, then schema, then data, as in Supabase's "Backup and restore
using the CLI" guide. `docs/superpowers/plans/2026-09-20-low-touch-operations-plan.md` covers
the free plan and the rest of the deployment gaps (no CI or branch protection on `main`,
squash-merged releases, no staging).

## Error tracking (Sentry)

Optional: with `SENTRY_DSN` unset nothing is initialised, so local development, the
tests and any deployment without it behave as before. With it set, `app/core/sentry.py`:

- sends **error events only**. Tracing, profiling and release-health sessions stay off,
  which keeps the project inside Sentry's free tier. Unhandled exceptions, 5xx responses
  (including database failures) and anything logged at `ERROR` become events.
- tags every event with an `environment` (`ENVIRONMENT`, else Vercel's `VERCEL_ENV`, so
  `production` or `preview`) and a `release`, the deployed commit (`VERCEL_GIT_COMMIT_SHA`;
  keep "Automatically expose System Environment Variables" on in the Vercel project).
- never collects request bodies or local variables, and scrubs each event before it
  leaves the function: cookies, query strings and every request header except a few
  harmless ones (`Authorization`, `Cookie`, `apikey`, `X-Forwarded-For`, and Vercel's
  IP-location and OIDC-token headers are all filtered); the values of credential-like
  environment variables (any name containing `KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `DSN`,
  ...); and anything shaped like an email address, IPv4 address, JWT or provider token.
- delivers events before the response goes out. Vercel can freeze the function as soon
  as a response is done (its legacy Lambda handler returns once it has read the body),
  which would strand events the SDK's background thread has not sent yet, so the
  catch-all 500 handler and `SentryFlushMiddleware` hold the response until delivery:
  at most 2 s, and only on requests that captured something.

Sentry's own alert rules do the paging: email on a new issue and on an error spike.

**Checking delivery on a preview deployment.** Preview deployments get no environment
variables today, so the app cannot even start there. For the check:

1. Scope `SENTRY_DSN` to Preview as well as Production, and give Preview the **dev**
   project's `SUPABASE_URL` and `SUPABASE_KEY`.
2. On a throwaway branch, add a temporary route that refuses to fail in production:

   ```python
   @app.get("/__sentry-check")
   def sentry_check():
       if os.environ.get("VERCEL_ENV") == "production":
           raise HTTPException(status_code=404)
       raise RuntimeError("Sentry delivery check")
   ```

3. Push the branch, and open `<preview URL>/__sentry-check?email=someone%40example.com`
   while signed in to Vercel. Expect the fixed 500 body.
4. In Sentry, the issue `RuntimeError: Sentry delivery check` appears within seconds with
   environment `preview`, handled `no`, and the preview's commit SHA as its release. The
   event's request has no query string, and `Cookie` (Vercel's sign-in cookie) and
   `X-Forwarded-For` show `[Filtered]`.
5. Delete the branch, and remove the Preview-scoped variables if you do not want them.

## Known serverless caveats

- **Rate limiting** (`slowapi`) keeps counters in process memory and keys on the
  socket address; on Vercel each instance counts separately and sees the proxy IP.
  A shared store (e.g. Upstash) keyed on `X-Forwarded-For` is the fix.
- **Scheduled invites** are sent by an in-process poller (`app/jobs/pending_invites.py`)
  started in the FastAPI lifespan. Serverless instances are short-lived, so queued
  invites can be delivered late or not at all until the poller moves to Vercel Cron
  or `pg_cron`.

## Docker fallback (self-host)

```bash
cp .env.example .env   # fill in values
docker compose up --build
# frontend on :3000 (nginx proxies /api to the backend), backend on :5001
```

## Smoke test after a deploy

```bash
curl -s https://<backend-domain>/health            # {"status":"healthy","service":"backend"}
curl -s -o /dev/null -w '%{http_code}\n' https://<frontend-domain>/   # 200
```

Then sign in on the frontend and open a class: the request to
`/api/classes` must return 200 with the class list (a 401 means the frontend and
backend point at different Supabase projects).
