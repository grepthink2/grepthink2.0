# Backend: rules and gotchas

Read this before changing anything under `backend/`. The root [AGENTS.md](../../AGENTS.md) holds the rules for every change; `backend/STYLE_GUIDE.md` covers code style and the response format, `backend/README.md` the tests.

## How controllers work

- **Data access (backend).** Controllers take the client from `app.core.db.get_client()` and
  authorize with `app.core.authz`. Every `.execute()` is a network round trip, so batch:
  embed related rows over foreign keys (`projects(class_id, classes(created_by))`, with
  `!fk_name` hints where a table has several FKs to one target), use `.in_()` instead of
  per-row loops, run independent reads with `fan_out({...})`, and validate everything in
  memory before one bulk `insert` / `upsert` / `delete`. Tests pin a round-trip budget with
  `FakeSupabase.executes`. `backend/STYLE_GUIDE.md` has the details.
- **Errors.** Raise `HTTPException` with a fixed `detail`; a failed database request raises
  `DatabaseError` (503 unavailable, 409 conflict, 500 read or write failure, each with a `code`),
  and `app/core/errors.py` logs anything else uncaught and answers
  `{"detail": "Internal server error", "code": "internal_error"}`. In the web client a failed
  call throws `ApiError` (status, detail and the backend's `code`), and a 401 signs the user out
  locally.

## Authorization and data safety

- **`service_client` bypasses RLS.** Controllers query Postgres with the service
  role, so Row-Level Security does **not** protect you (RLS is on for every table, and most
  have no policies). A missing membership/ownership check in a controller is an
  IDOR — authorization correctness is 100% in Python. Verify access on every read/write.
- **The browser gets no table access, by grant as well as by policy.** `anon` holds nothing in
  `public`; `authenticated` holds `SELECT` on the Realtime tables only, and new tables start with
  no client privileges (`2026-09-21_lock_down_direct_table_access.sql`). Never add a write policy
  or a `GRANT` for those roles to make something work: route it through the backend. A table the
  browser must read over Realtime needs a `SELECT` policy scoped by `auth.uid()` **and**
  `GRANT SELECT … TO authenticated`.
- **Identity columns are never taken from a request body.** `profiles.email`, `profiles.edu_email`
  and `profiles.role` decide whose roster row and whose privileges an account gets. The email
  comes from the verified token, `edu_email` is written only by `verify_edu_email` (or from the
  token's address when it is a school email — `.edu`, or an institution's `email_domains`;
  `app/institutions/controller.py` `is_school_email` — not just `.edu`), and the role is written
  once by `create_user`. A login email change goes through Supabase Auth (Settings → Change),
  and `GET /api/profiles/me` re-mirrors the token's email afterwards. See `AUTH.md`.
- **Match identifiers with `eq`, not `ilike`.** `%` and `_` are wildcards: an `ilike` on a join
  code once let `%` join any class. Validate the shape first, then match exactly.
- **Secrets stay server-side.** `.env` lives at the repo root (see `.env.example`), and Vite
  exposes only `VITE_*` (`envPrefix`). Never widen that prefix: the same file holds
  `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET`.

## Routes, SQL and derived data

- **Routes are defined by each feature's `url.py`** (and the OpenAPI pages it produces at `/docs`).
  The web client (`lib/api/<domain>.ts`) and the agent catalog follow it, and both are
  hand-maintained, so they can drift. Confirm a route exists before adding or calling a client
  method, and add the method to the matching domain file (`lib/api.ts` spreads them all into
  `api`; `apiFacade.test.ts` fails if two domains share a method name).
  `backend/scripts/check_api_client.py` (run by pytest and as its own CI step) fails when a
  request in `frontend/src` or an action in `grepthink-actions.json` matches no route, or when
  a route has no caller there and no reason in its `SERVER_ONLY` list.
- **Never depend on unapplied SQL.** Migrations in `backend/database/migrations/` are
  applied by hand, dev first and then prod; merging does not apply them. Code must work on
  the schema that is live, and an upsert needs a unique constraint that already exists.
- **`projects.num_members` is derived.** After any `project_members` write call
  `projects.controller.recount_num_members(client, project_ids)`; never read-modify-write it.

## Platform

- **`backend/api/index.py` is the Vercel entrypoint.** It only re-exports `app`; keep the
  `__all__`, which stops ruff deleting the import as unused. Keep tool settings out of a
  `backend/pyproject.toml`: Vercel reads that file as a dependency source, and deployments
  install from `requirements.txt`.
- **Sentry scrubs by name and by shape.** With `SENTRY_DSN` set, `app/core/sentry.py` filters
  the values of env vars whose names look like credentials (`KEY`, `SECRET`, `TOKEN`,
  `PASSWORD`, ...) and anything shaped like an email, IP address, JWT or provider token. Name
  new credentials that way, and keep names, grades and review text out of exception and log
  messages: nothing can recognise those.
- **Rate limiting** (slowapi) is per route: `@limiter.limit(...)` (+ a `request: Request` param)
  sits on the auth routes, contact, the issue form, `GET /api/institutions`, message sending, the
  `/api/email` dispatch, webhook and unsubscribe routes, the scrum board's PR refresh and AI drafts,
  stats, analytics and the search index. The search index's limit is per signed-in user
  (`key_func=_search_rate_key` in `app/search/views.py`): on Vercel every request arrives from
  the proxy's address, so a limit keyed by address is one bucket for everybody. Add one to any
  new public or abuse-prone endpoint.
- **Email goes through the outbox.** Queue an email with `app.outbox.controller.enqueue`
  (one row per recipient, a `kind` registered in `app/outbox/kinds.py`, a `dedupe_key` when the
  producer may run twice) instead of sending from a request or a background task: Vercel pauses
  an instance between requests, so a send started inside one can be cut off and lost. Only interactive
  emails the user is waiting for (verification codes, the contact and issue forms) call
  `app.utils.email.send_email` directly. Reminder/digest kinds need a preference `category`.
- **Product events** go through `app.core.events.record(kind, ...)` (one insert; a database failure
  is logged at WARNING and never raised, an unregistered kind raises `ValueError`; kinds live in
  `KINDS`; `meta` holds ids and short enums only — never names, emails, grades or text). Pass ids
  and timestamps as strings: a `UUID` or `datetime` raises `TypeError` before anything is written
  (tests catch it; the fake client does not serialize).
- **Analytics counts in Postgres, authorizes in Python.** `app/analytics` fans out `analytics_*` SQL
  functions over `.rpc()` and composes one payload; who may see an institution is decided by
  `scope_for_user` (maintainers from `ANALYTICS_ADMIN_EMAILS`, instructors through the classes they
  created). A missing or failing function is a card in `failures[]`, never a 500. The nightly
  `analytics_daily` rollup runs under pg_cron (`prod/2026-10/2026-10-07_analytics_cron.sql`); its
  `class_id` has no foreign key on purpose, so deleted classes keep their history.
