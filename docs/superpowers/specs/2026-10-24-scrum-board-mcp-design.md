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
- A GrepThink page for listing or revoking connected apps. Revoking happens from the assistant's own settings
  in v1.
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
   at `https://grepthink2.com/oauth/consent?authorization_id=…`. If the student isn't signed in, the page
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

## Sign-in (decided: option 1, Supabase's OAuth 2.1 server)

GrepThink already authenticates with Supabase Auth. Supabase's OAuth 2.1 server feature makes the project's
Auth an authorization server for MCP clients. It provides PKCE, dynamic client registration and discovery at
`https://<project-ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1`. Supabase issues the tokens,
and GrepThink hosts only the consent UI. The maintainer chose this over writing an OAuth server in FastAPI.

- **Dashboard config (DEV first, then PROD with the maintainer's approval):** enable the OAuth server, enable
  dynamic client registration, and set the authorization path to the site's `/oauth/consent`. This is a
  project setting, not a migration. Note the steps in the pull request.
- **Consent page:** a new public-shell route `/oauth/consent` in `frontend/src/App.tsx`, as a lazy route like
  the other pages. It:
  - reads `authorization_id`;
  - sends a signed-out visitor to `/login` with a return path back to the consent URL (check how `Login`
    handles a return path today, and add one if it has none);
  - loads the request details through supabase-js's OAuth-server methods and shows the client's name;
  - posts Approve or Deny through the same methods, then follows the redirect it returns.

  It is built from kit components (Card, Button, Alert). Error states: missing or expired `authorization_id`,
  and a user with no profile row (send them to finish sign-up).
- **Tokens:** OAuth access tokens are ordinary Supabase JWTs (`sub`, `aud: authenticated`) plus a non-null
  `client_id` claim, so `verify_supabase_token` in `backend/app/dependencies.py` already verifies them.
- **Signing keys (checked 2026-10-24):** DEV and PROD both sign with ES256, verified through JWKS. The
  legacy HS256 secret only verifies old tokens. The OAuth server needs no key rotation. It is present and off
  in both projects (`oauth_server_enabled=false`, dynamic registration off, no authorization path).
- **App tokens: deny by default, open per surface (agreed with the maintainer).** A token that carries
  `client_id` was issued to another app acting as the user (Claude and ChatGPT now, perhaps a Jira plugin
  later). Outbound integrations, where GrepThink signs in to Jira, never involve these tokens.
  - **Database:** app tokens get nothing.
    - A migration adds `public.is_first_party_session()`, true when `auth.jwt() ->> 'client_id'` is null, and
      a RESTRICTIVE policy `app_tokens_denied` using it on every table that has policies, in `public` and on
      `storage.objects` (Storage's upload policies would otherwise let an app replace avatars and logos).
      Restrictive policies AND into every permissive one, so existing policies keep their names, which
      differ between DEV and PROD on Storage, and later policies are fenced too.
    - This migration is an authorization change, reviewed on its own.
  - **Backend:** every existing route refuses app tokens with 401. The check goes in the shared token
    dependency, so a new route is fenced without doing anything.
    - A surface opts in explicitly with a dependency such as `require_app_access("scrum:fill")`, backed by a
      small in-code map from capability to allowed `client_id`s.
    - Supabase's scopes cover only profile information, so capabilities stand in for scopes.
    - Claude and ChatGPT register dynamically, so their `client_id`s aren't known in advance. Their entry is
      "any client registered through the MCP flow", limited to `scrum:read` and `scrum:fill`. A future app
      that needs more gets its own line.
    - `/mcp` accepts only app tokens.
    - Check first that nothing on the site itself gets a `client_id` token. Normal password and Google
      sign-in don't.
  - **Account endpoint:** the database fence can't cover Supabase Auth's own `/user` endpoint. Find out on DEV
    what an app token can change there (email, password). If it can change either, raise it with the
    maintainer before PROD.
- **Protected-resource metadata:** the backend serves RFC 9728 metadata for `/mcp`, at
  `/.well-known/oauth-protected-resource` (and the path-suffixed form). It names the Supabase issuer as its
  authorization server. A request to `/mcp` without a valid token gets 401 with a `WWW-Authenticate` header
  pointing at that metadata. The MCP Python SDK's auth helpers provide this, given a token verifier that
  wraps `verify_supabase_token`.

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

- How the app-token fence is built: capability names and the "any MCP-registered client" entry.
- The batch write is one SQL function in one transaction.
- Batch caps: 10 sprints, 60 stories, 300 tasks.
- `get_board_context` is readable by staff too. Only `fill_board` needs membership.
- The `board_agent_fill` event, with `client_id` in `meta`.
- The connector-URL note on the board page.
- Connector validation is stricter than the board's routes (scale and membership), with the routes untouched.
- Stories may join planned or active sprints, never completed ones.
- Task-points vs story-points mismatches warn rather than refuse.
- The end-to-end test runs through a local backend and a temporary tunnel against DEV Supabase.
