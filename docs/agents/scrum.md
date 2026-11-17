# Scrum board and its connector

Read this before changing `backend/app/scrum`, `backend/app/mcp`, `frontend/src/features/scrum` or `features/connector`.

- **Sprints come from the class.** `classes.sprint_count` (1–20), `sprint_frequency` (`weekly`,
  `biweekly`, `monthly`) and `sprints_start_on` are the class's sprint schedule, all three or none,
  and `scrum.controller.ensure_project_sprints` makes each team's "Sprint 1" to "Sprint N" from it,
  numbered by `sprints.sequence`: when the team is created, and for every team on
  `PATCH /api/classes/{class_id}/sprints`. Team members can still add a sprint of their own (the
  board's "New sprint", `POST /api/projects/{project_id}/scrum/sprints`); it has `sequence NULL`,
  and the schedule never touches it. A sprint's dates must fit the class, and a class with a
  schedule caps a team at its `sprint_count` sprints (`create_sprint` answers 409 past it).
- **Sprint status is derived from dates.** `scrum.schedule.sprint_status` makes a sprint `planned`,
  `active` (from `starts_at` through `ends_at`) or `completed` by the day at the project's school
  (`_today`, as the burnup day is), and the board opens on today's sprint, else the latest one
  that has started, else the first (`_select_sprint`).
  Nothing writes or reads the stored `sprints.status` column: `update_sprint` drops a `status`.
- **Stories have a priority order and acceptance criteria.** A sprint's stories, and the backlog, sort
  by `user_stories.rank` (NULLs last), then by key: `scrum.controller._story_order`, mirrored by the web
  client's `utils/storyOrder.ts`. `scrum_set_story_order` (behind `PUT /api/projects/{project_id}/scrum/stories/order`)
  is the only writer of ranks: it locks the list and refuses (the route's 409) unless the ids are
  exactly that list's live stories. A new story has none, and `update_story` sets it back to NULL
  whenever the story moves to another sprint or the backlog. In the web client a story edit never
  writes a rank. `acceptance_criteria` is a list on the story (at most 20, each 1–300 characters
  trimmed); the connector reads it, and `fill_board` does not take it yet.
- **The burnup counts tasks in hours or points.** Scope is the sum of the sprint's task estimates
  (`tasks.points` or `tasks.estimate_hours`) and completed the same sum over its done tasks; story
  points count nowhere, and points are drawn only when every task in the sprint has them
  (`scrum.burnup.units_available`), else hours. Every write that moves either line takes a
  `sprint_burnup_days` snapshot in both units (`_snapshot_burnup_safe`), a task estimate edit or
  delete included; a story points edit takes none.
- **A team's move-in goes through `fill_board`.** While a board holds 3 stories or fewer with
  `user_stories.imported_at` NULL, the connector also takes done and in-progress tasks and stories in
  finished sprints, and marks every story it writes. `scrum_fill_board` dates the tasks' `task_moves` rows and
  replaces the saved `sprint_burnup_days` rows of each started sprint it adds to (`p_burnup`), all in one
  transaction, and that chart then says "Includes imported work". This is the only writer that backdates a
  move or rewrites past burnup rows; the board's own writes only snapshot today.
  `scrum.controller.import_window_open` is the window's one rule. The board's dismissible notice
  (`ImportNudge`) invites a team in only while the board response says `connector_ready` and
  `import_window_open`, and not yet `has_imported_stories`. On the student Home, `MoveInInvite` opens a
  modal with the same invitation once a visit (a browser tab's session) while the summary response
  says `connector_ready` and its `story_count`, imported stories included, is under 3. The board's
  "Connect an AI assistant" ⓘ pulses while the connector is ready, on every board load until it is
  clicked, and its popover offers the move-in prompt. `MOVE_IN_NUDGE_ON`
  (`features/connector/config/moveInNudge.ts`) turns the notice, the pulse and the Home modal off together.
- **Connected apps get GrepThink tokens, never Supabase tokens.** The scrum board MCP connector (`app/mcp`) is
  its own OAuth server: the MCP SDK serves `/register`, `/authorize`, `/token` and `/revoke` on
  `app/mcp/oauth.py`, the student answers on the site's consent page (`/api/mcp/authorizations`), and the
  app gets opaque tokens (hashed in `mcp_tokens`) that only `/mcp` accepts. A Supabase token in an app's
  hands could change the student's password through Supabase Auth, which nothing on our side can fence.
  Students end a grant in Settings → Connected apps. ⚠️ `/register` accepts any redirect URI for now: a
  known safety issue to revisit. Supabase's own OAuth server stays off on every project: a token it
  issued would carry the student's whole account, and nothing on our side can fence Supabase Auth.
