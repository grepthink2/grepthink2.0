# Handoff — PR 0 (class sprint schedule and burnup units) → continue on boxes.dev

Paused on the maintainer's request on 2026-10-22. Branch `feat/class-sprint-schedule`, cut from
`origin/beta` 50f65d16. This commit force-adds files that are gitignored on purpose (the plans folder
and the SDD workspace) so they travel with the branch: **drop this commit before opening the PR**
(`git revert <this sha>` or `git rm -r --cached docs/superpowers/plans .superpowers && git commit`).

## State

| Item | Where |
| --- | --- |
| Approved spec | `docs/superpowers/specs/2026-10-22-sprint-plan-docs-design.md` (committed 9552e1d5; Part 0 DDL updated in 11a4ec78) |
| PR 0 plan (13 tasks) | `docs/superpowers/plans/2026-10-22-class-sprint-schedule.md` |
| Roadmap for PRs A, B, C | `docs/superpowers/plans/2026-10-22-sprint-plan-docs-roadmap.md` |
| Data-model review | `docs/superpowers/plans/2026-10-22-data-model-review.md` |
| SDD ledger, briefs, reports | `.superpowers/sdd/2026-10-22-class-sprint-schedule/` (`progress.md` first) |
| Task 1 | complete, reviewed clean after one fix round: 1ef39881, e3903fdd, 11a4ec78 |
| Task 2 | committed f9c82755 by the controller after the implementer was stopped mid-task; 7 tests green, ruff clean, **not task-reviewed** |
| Tasks 3–13 | not started; briefs already extracted in the workspace |

## Resume (Claude Code, repo root, on this branch)

Paste:

> Resume the PR 0 implementation with superpowers:subagent-driven-development. The plan is
> `docs/superpowers/plans/2026-10-22-class-sprint-schedule.md`, the spec
> `docs/superpowers/specs/2026-10-22-sprint-plan-docs-design.md`, the ledger
> `.superpowers/sdd/2026-10-22-class-sprint-schedule/progress.md` (its first line names the plan; trust it
> over memory). Task 1 is complete. Task 2 is committed at f9c82755 but NOT reviewed: start with the Task 2
> task review (review package over 11a4ec78..f9c82755), run its fix loop if needed, then Tasks 3–13 in
> order. Implementers are Opus at max effort, one at a time; reviewers are fresh subagents; the final
> whole-branch review runs on Opus at max. Ask the maintainer before applying any DEV migration (Task 1's
> two files are still "Applied: pending"); never push to beta or main; commits end with
> `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Before opening the PR, drop the handoff
> commit that carries the plans folder and `.superpowers`.

## Environment on the new machine

- Backend: Python 3.12 venv at `backend/.venv` (`python3.12 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements-dev.txt`); tests need no `.env` (conftest stubs `SUPABASE_*`).
- Frontend: Node ≥ 22.12 (CI uses 24), `cd frontend && npm ci`.
- Gates: backend `ruff format . && ruff check . && python -m pytest`; frontend `npm run lint && npm run lint:design && npm run build && npx vitest run`.
- The git-excluded browser harnesses (`frontend/scrum-mock/`, launch config `scrum-mock`) exist only on the Mac; Task 12 says "if present".
- The Supabase/Vercel/Cloudflare CLIs run only through `scripts/*.sh` with tokens that live in gitignored folders on the Mac; DEV migrations are applied by the maintainer.
