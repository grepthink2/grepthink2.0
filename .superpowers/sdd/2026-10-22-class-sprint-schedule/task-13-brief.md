### Task 13: Docs, schema mirror and the PR

**Files:**
- Modify: `AGENTS.md` (Gotchas: "Sprints come from the class" — `classes.sprint_*`, `sprints.sequence`, `ensure_project_sprints`, no New sprint in the client; "Sprint status is derived from dates"; "The burnup counts tasks in hours or points")
- Modify: `supabase/schema.sql` (append the two migrations' DDL to the hand-maintained block, as the task-dependencies change did, once DEV has them)
- Modify: `backend/README.md` only if the drift check's instructions mention routes by count

- [ ] **Step 1: Write the AGENTS.md lines** (three bullets, two sentences each) and mirror the DDL in `supabase/schema.sql`.

- [ ] **Step 2: Run every gate**

Run: `cd backend && .venv/bin/ruff format . && .venv/bin/ruff check . && .venv/bin/python -m pytest` then `cd frontend && npm run lint && npm run lint:design && npm run build && npx vitest run`
Expected: all green; note the totals for the PR body.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md supabase/schema.sql
git commit -m "docs: sprints come from the class; schema records the schedule and burnup columns"
```

- [ ] **Step 4: Open the PR onto `beta`** (push with the maintainer's word, per the repo's flow) with a body that carries: the two migrations and their PROD apply order (both before the release merge, expand-only), the "existing classes need a schedule in Class Settings" note, the two plan-added error details, the `update_class_sprints` partial-regeneration note from Task 8, and the gate totals.

---

## Self-review notes

- Spec coverage: Part 0's three sections map to Tasks 1–8 (backend) and 9–12 (web); D5's cron file belongs to PR A (documents) and is not here; D9's `HOURS_REQUIRED` is PR A's finalize rule.
- Names used across tasks: `Schedule`, `sprint_windows`, `schedule_end`, `sprint_status`, `schedule_problem`, `ensure_project_sprints`, `Totals`, `units_available`, `default_unit`, `UNIT_UNAVAILABLE`, `updateClassSprints`, `sprintWindows`, `scheduleEnd`, `setBurnupUnit`, `PointsChip missing` — each defined once above where it is produced.
- Review Focus lines 1–5 are pinned in Tasks 2, 6/8, 5/8, 3 and 4.
