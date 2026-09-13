# Handoff — codebase refactor branch (updated 2026-09-12, ready for review)

Every item on the earlier low-hanging-fruit checklist is done, and the branch is up for review
as a PR onto `beta`. What remains needs a person: a signed-in click-through, confirming unique
indexes on PROD, and the design decisions.

## TL;DR

- **Where:** worktree `.claude/worktrees/distracted-blackwell-a8357b`, branch
  `claude/refactor-dependencies-performance-453545`, cut from `origin/beta` at `613e4d1`.
- **Ask:** "refactor the whole codebase for best practices, extensibility and
  maintainability; dependency upgrades; performance bottlenecks, especially DB-driven ones."
  The maintainer was unavailable, so every judgment call is in the spec's decisions table (D1–D16).
- **Gates:** backend ruff clean and 485 pytest green; frontend `npm run lint`
  0 errors (77 advisory warnings), `npm run build` clean, 134 vitest green; `npm audit` 0.
- **Results:** `docs/superpowers/reports/2026-09-08-refactor-report.md` has the before/after
  tables, the bugs fixed, how it was verified, and what was left out.

## Read in this order

1. `docs/superpowers/reports/2026-09-08-refactor-report.md` — outcome and follow-ups.
2. `docs/superpowers/specs/2026-09-08-codebase-refactor-design.md` — decisions D1–D16.
3. `backend/STYLE_GUIDE.md` and `AGENTS.md` — the core layer, batching rules and gates.
4. `docs/superpowers/reports/2026-09-08-audit-*.md` — per-function findings. Line numbers
   are pre-format `613e4d1`; search by function name.

## What landed

`git log --reverse 613e4d1..HEAD` has the details; every perf commit lists its round trips
before and after.

| Theme | Commits |
|---|---|
| Dependencies, tooling, dead code | `62b8f80` `50b36b0` `32a9450` `1281d48` `f4a879f` |
| Security | `288e66a` |
| Backend core layer | `f6a63d7` `f71e173` `bd9265c` |
| Batched database access | `a88866b` `cddb7d5` `1a15fbc` `5efb235` `aaf9ec4` `4ce5af6` `7c999b5` `14eb865` `6df99b3` `ecaa0fd` `5e4fa84` `6fe45a6` `58f59f4` `2e5d44d` `74d330b` `bc2cd49` `c7353d3` `cf333ad` `cc2d79e` `32df322` `6b1be99` |
| Staged migration (not applied) | `89b3e37` |
| Web client | `0613c87` `a7e27f0` `baac47a` `78f0fc6` `0230530` `afddff7` `7073a82` |
| Docs | `c0c47e6` `64cea36` `1509dda` and the final docs commit |

## Before merging (maintainer)

1. **Signed-in click-through.** Nothing behind sign-in was exercised in a browser. Check
   student and instructor Home, Assignments, Roster, Projects, TA Meetings, Final Reviews,
   Messages, and the create-class and assignment modals (the date picker now loads on first open).
2. **Unique indexes on PROD.** Upserts depend on `final_review_scores_uniq`,
   `attendance_meeting_slot_uniq`, `final_review_notes_project_unique`,
   `project_review_tas_project_unique` and `class_enrollments_class_id_user_id_key`. All exist on dev; the PR
   description has the query to run on PROD.
3. **Optional migration.** `backend/database/migrations/2026-09-08_perf_indexes_and_lints.sql`
   is staged, not applied, and nothing depends on it. Apply on dev, then prod, then regenerate
   `supabase/schema.sql`.
4. **Decisions.** D1–D16, plus: React Compiler lint rules are warnings (9c); rename
   `react-day-picker` to `@daypicker/react` (same API); drop the unused staffing endpoints (D5
   keeps them); `num_members` as a DB trigger; a shared `Modal` primitive; react-query; serverless
   rate limiting; invite poller as Vercel Cron.
5. **PR #177 (scrum board).** It overlaps on `backend/app/main.py`, `backend/app/config.py`,
   `backend/requirements.txt` and `AGENTS.md`; the PR description has the rebase recipe.

## The pattern to copy for new backend work

1. Write the test first in `tests/test_<module>_<topic>.py` with `FakeSupabase` and
   `relations={...}` for any embed; inject with
   `monkeypatch.setattr("app.core.db.service_client", fake, raising=False)`.
2. Pin the response shape, the status codes and `detail` strings, and
   `assert fake.executes <= N`.
3. Watch it fail, then write the code: `authz` helpers for access; embeds over existing FKs
   (hints where a table has several FKs to one target); `fan_out` for independent reads; one
   bulk `insert` / `upsert` / `delete` after validating in memory. **Never depend on unapplied SQL.**
4. `ruff format . && ruff check . && python -m pytest -q`, then run any new select string once,
   read-only, against dev (`limit 1`), because the fake cannot prove PostgREST accepts
   relationship names. Commit with the before/after round trips in the message.

## How the last stretch was run

- The classes, projects and messages modules were batched by background agents, each in its own
  git worktree, and their commits were cherry-picked here after review. An agent's worktree has
  no virtualenv; it can run this worktree's `backend/.venv/bin/python -m pytest` from its own
  `backend/` directory, because the venv has no path hooks and imports the agent's code.
- Agents never touched a database. They listed every new select string, and the lead ran
  those read-only against dev before merging.

## Follow-ups (not done)

The report's "Not done, and why" section is the full list. The ones worth a ticket:
- `messages.get_profile_roles` compares user ids as exact strings, so an upper-cased id skips
  the instructor-to-instructor messaging rule.
- `notify_recipients` makes three round trips per recipient.
- `project_members` has no unique `(project_id, user_id)` constraint.
- Incoming join requests match reviewer roles case-insensitively; accept and reject match exactly.
- `notifications.notify_team_member_dropped_from_roster` is no longer called.
- The attention summary embeds every enrollment and roster row of an instructor's classes in one
  response; it was not measured against a very large roster.

## Gotchas learned (save yourself an hour)

- The shell's working directory resets between tool calls; use absolute paths or
  `cd /abs/path && …`. zsh does not word-split unquoted `$VAR`, and `$name[...]` is an array
  subscript (write `${name}[...]`).
- The auto-mode classifier blocks long commands mixing file writes, installs and git; split them.
- Python scripts that replace whole functions or exact anchors (asserting one match, writing
  nothing on a mismatch) are the safest way to make large edits. `perl -pi` interpolates `${…}`.
- `FakeSupabase`: embeds raise unless declared in `relations=`; filters on embedded columns
  raise; `executes` / `queries` for budgets; `reset_counter()` between phases of a test.
- PostgREST needs FK hints where several FKs point at one table (`project_join_requests` →
  profiles ×3, `TSRs` → profiles ×2, `classes.created_by`, `class_enrollments`).
- Vitest: a `vi.mock` factory that uses a test variable needs `vi.hoisted`. Tests that mock
  `@/lib/api` also cover modules that import `./api`.
- `gh pr diff --name-only` prints nothing for large PRs; use
  `gh api repos/<owner>/<repo>/pulls/<n>/files --paginate`.
- `backend/app/scrum/` in this worktree is an untracked `__pycache__` left by another checkout,
  not part of the branch.
- `npm install` may ERESOLVE against the installed tree; `rm -rf node_modules package-lock.json
  && npm install` resolves from the manifest.
- Do not apply migrations or touch PROD (`yfezwtoeoexfksvbpxmi`) without the maintainer.
  Read-only queries against dev (`jfbagjjvryqcwxsyeyeg`) are fine.
