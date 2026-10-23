### Task 1: Migrations

**Files:**
- Create: `backend/database/migrations/2026-10/2026-10-22_class_sprint_schedule.sql`
- Create: `backend/database/migrations/2026-10/2026-10-22_burnup_hours.sql`

**Interfaces:**
- Produces: columns `classes.sprint_count smallint`, `classes.sprint_frequency text`, `classes.sprints_start_on date` with CHECK `classes_sprint_schedule_valid`; `sprints.sequence smallint` with partial unique index `sprints_project_sequence_uq (project_id, sequence) WHERE sequence IS NOT NULL`; `sprint_burnup_days.scope_hours integer NOT NULL DEFAULT 0`, `sprint_burnup_days.completed_hours integer NOT NULL DEFAULT 0`.

- [ ] **Step 1: Write the schedule migration** with the DDL in the spec's Part 0 verbatim, wrapped in `BEGIN; SET LOCAL lock_timeout = '5s'; … COMMIT;` and the repo's banner header (purpose, "EXPAND, idempotent", `Applied: DEV — pending   PROD — pending`, a PREFLIGHT comment: `SELECT count(*) FROM public.sprints WHERE sequence IS NOT NULL;` expected 0).

- [ ] **Step 2: Write the burnup migration**: the two `ALTER TABLE public.sprint_burnup_days ADD COLUMN IF NOT EXISTS …` lines from the spec, same header style.

- [ ] **Step 3: Verify the files parse**: `grep -c "ADD COLUMN IF NOT EXISTS" backend/database/migrations/2026-10/2026-10-22_*.sql` prints `5` across the two files (3 + 2). Ask the maintainer to apply both on DEV through the Supabase connector (dev) and record the date in each header; do not wait for it: every test in this plan runs on the fake.

- [ ] **Step 4: Commit**

```bash
git add backend/database/migrations/2026-10/2026-10-22_class_sprint_schedule.sql backend/database/migrations/2026-10/2026-10-22_burnup_hours.sql
git commit -m "feat(db): class sprint schedule, sprint sequence and burnup hours columns"
```

