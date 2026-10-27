# Scrum board MCP connector: design

Date: 2026-10-24. Status: agreed with the maintainer in chat; awaiting their read of this document.

## Why

A team's scrum board starts empty, and the plan for it usually already exists somewhere else, often in a
scrum doc, a backlog or meeting notes, or in a Claude or ChatGPT conversation that has seen them. Copying it
into the board by hand is slow, and students skip the descriptions, estimates and assignees that make the
board useful. This feature gives their chat assistant a GrepThink connector. The student pastes or types what
they have, and the assistant drafts stories and tasks that fit the board's model. The student approves the
plan in chat, and the assistant writes it to the board.

Success: a team goes from an empty board to a populated, sensibly estimated and assigned backlog, with sprints,
in one short conversation, and nothing reaches the board that the student didn't approve.

## Who and where

- **Users:** students who are members of a project team (`project_members` row). Same rule as editing the
  board today (`_require_writer` in `backend/app/scrum/controller.py`): TAs and instructors can't use the
  write tool, and they get the same 403 they get on the board.
- **Clients:** Claude (claude.ai, desktop, mobile) and ChatGPT, through their remote-MCP / custom connector
  support. Both reach only remote servers, so the connector is a hosted HTTP endpoint, not a local process.
- **Input:** whatever the student pastes or types into the chat. The connector reads no GitHub, Notion or
  docs itself.

## Goals

1. A remote MCP server, hosted inside the existing FastAPI backend, that the student adds to Claude or
   ChatGPT by URL.
2. Sign-in on grepthink2.com with the student's GrepThink account (password or Google), via OAuth. There are
   no new accounts and no API keys to paste.
3. Tools that let the agent learn the board's rules and current contents, then add sprints, stories and tasks
   in one validated, all-or-nothing batch.
4. Drafts may leave optional fields empty. The agent warns the student about every gap, both in the plan and
   after writing.

## Non-goals

- Editing, moving or deleting anything that already exists on the board, including existing sprints
  (no starting, ending or renaming them). **Merge only:** the connector only adds. The maintainer chose this
  over an overwrite option, because deleting a story permanently cascades its tasks, comments and move
  history, and the board is shared by the team.
- Dependencies between tasks. The team links them on the board afterwards.
- Reading external sources (repos, Notion, Drive).
- Anything for TAs or instructors.
- Rate limiting. **The maintainer's explicit decision for v1**, as a deliberate exception to the AGENTS.md
  rule ("add one to any new public or abuse-prone endpoint"). Record it in the pull request.

## Anti-goals (it fails if it does these, even if it works)

- Writing to the board before the student has seen the plan and said yes.
- Leaving a half-written board when a batch fails partway.
- Letting a token issued to Claude or ChatGPT act as the student across the rest of the GrepThink API.
- Weakening the board's authorization: every write is checked against `project_members` in Python, exactly
  like the board's own routes (`service_client` bypasses RLS).

## The user's flow

1. **Connect, once.** In Claude or ChatGPT, the student adds a custom connector with the URL
   `https://<api host>/mcp`. The assistant discovers the auth server, registers itself and opens a browser tab
   at `https://grepthink2.com/oauth/consent?request=…`. If the student isn't signed in, the page
   sends them through the normal login and back. It then shows "Allow **<client name>** to read your teams'
   scrum boards and add items to them?" with Allow and Deny buttons. After Allow they return to the chat.
2. **Fill.** The student pastes their material and asks for the board to be filled. The agent:
   1. calls `list_my_projects` and, if there is more than one, asks which project;
   2. calls `get_board_context` for that project;
   3. drafts the plan and shows it in chat as readable text: sprints, then stories with their tasks, each with
      its points, hours, tags, assignee and a short description, followed by a list of warnings about missing
      fields and anything it skipped as a likely duplicate of an existing item;
   4. revises the plan as the student asks;
   5. on an explicit yes, calls `fill_board` with `confirmed: true`, then reports what was created (keys and
      titles) and repeats the warnings the tool returned.
3. If the docs give no sprint dates, the agent asks rather than inventing them.

## Sign-in (revised 2026-10-27: GrepThink's own authorization server for /mcp)

The first design let Supabase's OAuth server issue the apps' tokens. On DEV that token turned out to carry
the student's whole account: it changed the password through Supabase Auth's `/user` endpoint, which
nothing on our side sees or can fence (see "Found on DEV"). The maintainer chose to issue our own tokens
instead. **Apps never hold a Supabase token.**

- **What the app sees** is unchanged: it adds `https://<api host>/mcp`, discovers the authorization server
  from the protected-resource metadata, registers itself, sends the student to a browser page, and gets a
  bearer token for `/mcp`. Only the issuer changes: the API itself instead of Supabase.
- **The authorization server is the MCP SDK's** (`mcp.server.auth`): given an
  `OAuthAuthorizationServerProvider`, it serves `/.well-known/oauth-authorization-server`, `/register`
  (dynamic client registration), `/authorize` (PKCE S256 required), `/token` (authorization code and
  refresh token) and `/revoke`, with the protocol checks done. We write the provider: storage and the
  hand-off to the consent page. These paths join `MCP_PATHS` as exact routes on the API host.
- **The student signs in with their normal GrepThink login.** `/authorize` stores the pending request and
  redirects to `https://grepthink2.com/oauth/consent?request=<id>`. The consent page (already built; it
  changes only where it sends the answer) uses the student's normal site session to call two new backend
  routes:
  - `GET /api/mcp/authorizations/{id}`: the app's name and redirect host, for the page;
  - `POST /api/mcp/authorizations/{id}` with `{"approve": true|false}`: on approve it binds the request to
    the caller's user id, issues the code and answers `{"redirect_url": …}`; on deny it answers the app's
    redirect URI with `error=access_denied`. Either way the page follows the URL.

  Both need `require_user` and a request that is pending and not expired (10 minutes). These routes get web
  client methods; they are not agent catalog actions.
- **Tokens are opaque random strings** (256 bits), stored only as SHA-256 hashes. Each `/mcp` request looks
  its token up: one round trip, cheap, and a revoked token stops at once. The token row carries the user id,
  client id and expiry; `/mcp` acts as that user exactly as before.
  - Access tokens last 1 hour. Refresh tokens last 30 days and rotate on use: the old one dies when the new
    one is issued.
- **Tables** (one migration, RLS on with no policies and no grants to `anon`/`authenticated`, like every new
  table since the 2026-09-21 lock-down):
  - `mcp_clients`: registered apps (id, name, redirect URIs, registered_at, last_used_at);
  - `mcp_authorizations`: pending requests and their codes (client, PKCE challenge, redirect URI, state,
    user once approved, code hash, expires_at, used_at);
  - `mcp_tokens`: access and refresh tokens (hash, kind, user, client, expires_at, revoked_at, and the
    refresh token's family, so reusing a rotated refresh token revokes the family).
- **Deny by default comes from the token type.** Our tokens are not JWTs that Supabase, PostgREST or the
  API's `verify_supabase_token` accept; only `/mcp`'s verifier knows them. A future integration (a Jira
  plugin) gets its own capability in the same tables instead of a new token kind.
- **Signing keys, `client_id` claims and Supabase's OAuth server are no longer involved.** Supabase's OAuth
  server stays off on PROD, and is turned back off on DEV.

### Settled by the builder (own authorization server)

- **Issuer** = `PUBLIC_API_URL` with no path. The SDK serves its endpoints at fixed root paths, and nothing on
  the API host collides (every existing route is under `/api`).
- **All provider state is in Postgres.** `MCPServer` turns the provider into its token verifier, so `/mcp` and
  the auth endpoints work on any serverless instance.
- **Codes are single-use.** One conditional update marks a code used, because the SDK loads and exchanges it in
  two calls. Reusing a rotated refresh token revokes its family, after a short grace window so an app that
  refreshes twice at once keeps working.
- **Client secrets are stored as registered**, because the SDK compares them directly. Claude and ChatGPT
  register as public clients (PKCE, no secret).
- **A grant has a fixed lifetime.** Every token of one Allow belongs to a family that ends 90 days (about one
  term) after the Allow, however often it refreshes. After that the student connects again.

### Decided by the maintainer (2026-10-27)

1. **Students cut apps off from GrepThink.** Settings gets a "Connected apps" list: each app the student
   allowed, when, and when it was last used, with a Disconnect button that revokes every token of that grant.
   Routes: `GET /api/mcp/connections` and `DELETE /api/mcp/connections/{client_id}`, both for the caller only.
   This replaces the non-goal "no GrepThink page for connected apps".
2. **Registration accepts any redirect URI for now.** ⚠️ **Safety issue to revisit:** anyone can register
   an app under any name (for example "Claude") with their own redirect URI, and one Allow click gives it
   the student's boards. The consent page shows the redirect host as the only hint. The likely fix is an
   allowlist (Claude's and ChatGPT's callbacks plus loopback addresses), or a warning for unknown hosts. The
   code carries the same flag where registration is handled.
3. **No rate limiting now.** A generic rules-based rate-limiting module is planned as its own later task
   (`2026-10-27-rate-limiting-rules-design.md`). Until then, registration keeps the tables small itself
   (builder's call): each registration deletes apps never used and registered more than 24 hours ago, and
   authorization requests past their expiry. Registration metadata has size caps.
4. Asked again; see the pull request.

## MCP server

- **Library:** the official MCP Python SDK (`mcp` on PyPI). Pin the newest stable release at implementation
  time (v2 went stable in mid-2026; confirm against its docs). Add it to `backend/requirements.txt` (runtime).
  Nothing else is new.
- **Hosting:** mounted into the FastAPI app at `/mcp` in `backend/app/main.py`, Streamable HTTP in stateless
  mode with JSON responses. The backend runs on Vercel serverless, so no session state may live in memory
  between requests.
- **Layout:** a new feature module `backend/app/mcp/`:
  - `server.py`: tool definitions and the mount;
  - `auth.py`: the token verifier and resource metadata.

  Tools call controller functions in `app/scrum` (new ones where needed) with the token's `sub`, so
  authorization lives where it already does.
- **CORS/headers:** `/mcp` is called server-to-server by Anthropic and OpenAI, not by the browser. Make sure
  the existing CORS and security-header middleware doesn't block it, and don't widen browser CORS for it.
- `backend/scripts/check_api_client.py`: the mount and the well-known routes have no web-client caller. Add
  them to `SERVER_ONLY` with a reason. They don't go in `grepthink-actions.json`.

### Tools

Descriptions are part of the product: they teach the agent the board's model and the confirm-first rule. Write
them carefully and test them on Claude and ChatGPT.

1. **`list_my_projects()`** returns the projects the caller is a member of: project id, name, class name and
   term. Read-only.
2. **`get_board_context(project_id)`** returns everything needed to draft (read-only; members and staff
   allowed, matching board read access, but it says whether the caller can write):
   - The model: stories contain tasks. Points sit on stories and tasks. Hours sit on tasks only, as whole hours
     from 1 to 15. Tags come from `TASK_TAGS`.
   - The project's `estimate_scale` and its allowed values (`ESTIMATE_SCALES`).
   - The field limits: title 200, description 20000 (markdown), sprint name 80.
   - Members: user id, display name, project role (for example Product Owner).
   - Sprints: id, name, dates, status.
   - Existing stories and their tasks: key, title, sprint and status only, for duplicate detection.
   - Today's date in the school's zone, so relative dates resolve.
   - Guidance text for drafting: split stories into tasks of 15 hours or less; snap points to the scale; prefer
     the "As a … I want … so that …" form for story descriptions with acceptance criteria; spread assignees by
     role where the docs don't say.
3. **`fill_board(project_id, confirmed, sprints[], stories[])`** writes the batch.
   - **`confirmed`** must be `true`. The description says to set it only after the student explicitly approved
     the exact plan shown. `false` returns an error telling the agent to show the plan first.
   - **`sprints[]`:** `{ref, name, starts_at, ends_at}` creates new sprints with status `planned`. `ref` is a
     local label stories can point at.
   - **`stories[]`:** `{title, description_md?, points?, assignee_id?, sprint?, tasks[]}`. `sprint` is either a
     new sprint's `ref` or an existing sprint's id. Omitted means backlog.
   - **`tasks[]`:** `{title, description_md?, points?, estimate_hours?, assignee_id?, tags?}`.
   - **Validation:** everything is validated in memory first, against the same rules as the board's routes and
     models. On any failure nothing is written, and the tool returns every problem as a list
     (`stories[2].tasks[0].points: 7 is not on the fibonacci scale`) so the agent can fix and retry.
   - **Stricter than the board's routes, for the connector only:** points must be on the project's
     `estimate_scale` (the board's routes only check `> 0`), and assignees must be current members of the
     project. The board's own routes are not tightened in this change.
   - **Sprints:** a story may join a new sprint or an existing sprint whose status is `planned` or `active`.
     A `completed` sprint is refused, because adding to it would raise a closed sprint's scope.
   - **Points consistency:** the burnup counts scope from story points and completion from done task points.
     When a story's task points don't sum to its points, the item gets a warning, not a refusal. The drafting
     guidance tells the agent to make them match.
   - **Optional fields may be empty.** The result lists **warnings** for each item missing points, hours (tasks),
     assignee or description.
   - **Cap:** at most 10 sprints, 60 stories and 300 tasks per call (my call; adjustable).
   - **Result:** the created sprints, and the stories and tasks with their new keys, plus the warnings.

### The all-or-nothing write (my call)

Keys come one at a time from `scrum_next_key` today, so a Python loop would cost dozens of round trips and could
fail halfway. Instead, add one SQL function, `scrum_fill_board(p_project_id uuid, p_reporter_id uuid, p_sprints jsonb, p_stories jsonb)`.
In a single transaction it:

- inserts the sprints;
- allocates keys the same way `scrum_next_key` does, by reusing it or its counter;
- inserts the stories and tasks with `reporter_id = p_user_id`;
- returns the created rows.

Python still does all authorization and validation before calling it. The function trusts its caller and is
`SECURITY DEFINER`-free, executable by `service_role` only, with no grant to `anon` or `authenticated`.

- The migration goes in `backend/database/migrations/2026-10/`, and `supabase/schema.sql` is updated once it is
  applied.
- The pull request is labeled `needs-prod-sql`. It is applied and checked on DEV inside a rolled-back
  transaction. **PROD only with the maintainer's approval.**
- The SQL function is reviewed on its own, per AGENTS.md.
- After the write, take one burnup snapshot for each sprint (existing or new) that received a story, using the
  existing `_snapshot_burnup_safe`.

### Events

Add `board_agent_fill` to `KINDS` (event kinds must match `^[a-z][a-z0-9_]{1,39}$`) in `app/core/events.py`, recorded once per successful fill. Its `meta` holds
the project id, the counts of sprints, stories and tasks, the warning count and the `client_id`. There is no
text.

## Frontend, beyond the consent page

A short "Connect your AI assistant" note on the scrum board page, behind an info popover or the board's empty
state. It shows the connector URL with a copy button and one line each for Claude and ChatGPT. Keep it out of
the entry chunk (the board is already a lazy route).

## Constraints

- AGENTS.md rules apply in full: authorization in Python, `get_client()`, batched reads (pin round trips in
  tests with `FakeSupabase.executes`), errors with fixed `detail`, Sentry-safe logs (no titles or names in log
  messages), current response shape, coverage thresholds only up.
- **Never depend on unapplied SQL:** the MCP feature is unusable until the migration is on the target
  environment. That's acceptable, because nothing else depends on it. Merge only after DEV is applied, and
  coordinate PROD with the maintainer.
- **The live database is the truth, not `supabase/schema.sql`.** The snapshot is well behind PROD: it lacks
  `scrum_apply_task_move`, `task_moves`, `sprint_burnup_days`, `institutions` and more, and it still shows
  policies PROD dropped. Read definitions from DEV (or a schema-only PROD dump the maintainer makes). Bringing
  the snapshot up to date is not part of this work. Update only the parts this change touches.
- **Access from the devbox:** DEV read and write through the managed `.env` and a DEV-only Postgres URL used
  only inside `BEGIN … ROLLBACK`. There are no PROD credentials on the box, by design.
- **Stop point:** if the DEV environment is incomplete, build and run the local gates, then stop before DEV
  or end-to-end testing.
- **Times:** sprint dates are plain dates. "Today" in context uses the school's zone
  (`institution_timezone`).
- **Release notes:** this is user-visible, so it goes in the next `release/<version>` notes, not in this
  pull request.

## Testing

- **Backend unit tests** with `fake_supabase`:
  - token containment, both ways;
  - every `fill_board` validation error;
  - warnings for missing fields;
  - member and non-member access, plus staff (403 on write);
  - the `confirmed: false` refusal;
  - the round-trip budget;
  - the tool list and schemas.
- **SQL function:** exercised on DEV in a rolled-back transaction (keys continue the project's sequence; a
  failing row rolls everything back).
- **Frontend:** consent page tests (signed out → login redirect, approve, deny, error states) with the
  supabase client mocked.
- **End to end, against DEV Supabase (my call):** there is no public DEV deployment (preview deploys get no
  env vars and sit behind Vercel sign-in). Instead:
  - run the backend locally against DEV Supabase and expose it through a temporary tunnel (a quick tunnel,
    no DNS change);
  - serve the consent page from the local frontend, with DEV's authorization path pointed at it;
  - connect Claude (and ChatGPT if the account allows custom connectors), fill a test project's board from a
    pasted scrum doc, and record the result in the pull request.

  The first run against PROD happens after the maintainer applies the SQL and the dashboard config there.

## Left to the builder

- Exact tool description wording and the JSON shape of `get_board_context`.
- Whether `scrum_fill_board` calls `scrum_next_key` or touches its counter directly (read its definition
  first).
- The SDK's exact mount and auth APIs for the pinned version.
- The consent page's copy and layout within the kit.
- Where the "Connect your AI assistant" note sits on the board page.

## Calls made without the maintainer (check these)

- The batch write is one SQL function in one transaction.
- Batch caps: 10 sprints, 60 stories, 300 tasks.
- `get_board_context` is readable by staff too. Only `fill_board` needs membership.
- The `board_agent_fill` event, with `client_id` in `meta`.
- The connector-URL note on the board page.
- Connector validation is stricter than the board's routes (scale and membership), with the routes untouched.
- Stories may join planned or active sprints, never completed ones.
- Task-points vs story-points mismatches warn rather than refuse.
- The end-to-end test runs through a local backend and a temporary tunnel against DEV Supabase.

## Found on DEV (2026-10-27)

A real OAuth flow on DEV (throwaway user and client, both deleted) showed:

- **The fences hold.** The app token read nothing from PostgREST (`[]`) and its Storage upload was refused
  by `app_tokens_denied`. Every `/api` route refused it with 401. `/mcp` took it and refused a site session.
- **Supabase Auth's own account endpoint does not.** With the app token, `GET /auth/v1/user`, a metadata
  update and **a password change** (`PUT /auth/v1/user`) all answered 200, and the new password signed in.
  Email change uses the same endpoint. `POST /logout?scope=global` also answered 204. Supabase Auth
  ignores the token's `aud` (a token with another audience was accepted too), so the access-token hook
  cannot fence it. This blocks PROD until the maintainer decides how to close it.

## Later

- **Rate limiting on `/mcp` and the MCP authorization endpoints.** Left out of v1 on the maintainer's
  decision, against the AGENTS.md rule for abuse-prone endpoints. It comes with the generic rules-based
  module (`2026-10-27-rate-limiting-rules-design.md`).
- **Redirect URI allowlist for `/register`** (decision 2 above).
