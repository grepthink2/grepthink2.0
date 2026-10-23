# Task 1 report: Migrations

Status: DONE_WITH_CONCERNS
Commit: 1ef39881 feat(db): class sprint schedule, sprint sequence and burnup hours columns
(branch feat/class-sprint-schedule, not pushed; trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`)

## What I implemented

1. `backend/database/migrations/2026-10/2026-10-22_class_sprint_schedule.sql` (86 lines)
   - Header in the 2026-10-18_team_meetings.sql shape: title line; purpose; "EXPAND, idempotent, one
     transaction." with the apply-before-the-code warning (on PROD, before beta is merged into main) and
     why applying early is safe; `-- Applied: DEV — pending   PROD — pending` (exact); bullets on the
     CHECK, the API's date rules, sprints.sequence and the partial unique index; a PREFLIGHT block with
     `SELECT count(*) FROM public.sprints WHERE sequence IS NOT NULL;` (expect 0; on a database that never
     had the column the query fails with `column "sequence" does not exist`, which is also fine).
   - `BEGIN; SET LOCAL lock_timeout = '5s';` then the spec's Part 0 DDL, byte for byte (13 lines), then `COMMIT;`.
   - A post-apply "Check" block like the reference's: the four columns' types and nullability, the
     schedule CHECK plus exactly one CHECK on sprints that names sequence (sprints_sequence_check), the
     index definition, and counts of classes with a schedule / sprints with a sequence (both 0 right
     after applying).
2. `backend/database/migrations/2026-10/2026-10-22_burnup_hours.sql` (44 lines)
   - Same header shape, Applied line and wrapping; the two lines
     `ALTER TABLE public.sprint_burnup_days ADD COLUMN IF NOT EXISTS scope_hours     integer NOT NULL DEFAULT 0;`
     `ALTER TABLE public.sprint_burnup_days ADD COLUMN IF NOT EXISTS completed_hours integer NOT NULL DEFAULT 0;`
   - Header notes: the old code's snapshot upsert names only the points columns (an insert gets 0 hours,
     a conflict update keeps the hours), so applying early is safe; pre-migration snapshots read 0 hours
     and the board treats them as no snapshot for that unit (spec D21).
   - Check block: both columns integer / NOT NULL / default 0, and 0 snapshots with hours.

Nothing was applied to any database; no psql, no Supabase tool. Only the two new files are in the commit.

## Verification

Brief's command:

    $ grep -c "ADD COLUMN IF NOT EXISTS" backend/database/migrations/2026-10/2026-10-22_*.sql
    backend/database/migrations/2026-10/2026-10-22_burnup_hours.sql:2
    backend/database/migrations/2026-10/2026-10-22_class_sprint_schedule.sql:4

Total 6 (`cat … | grep -c` prints 6), not the brief's 5: see concern 1. Every match is a DDL line; no
comment or Check query contains the phrase.

Other checks:
- DDL verbatim: `diff` of the spec's fenced sql block (extracted by its fences) against file lines 47–59 → identical.
- Statement split (comments and literals stripped): schedule file 14 statements, burnup file 7; parentheses balance in each; nothing after the last `;`.
  No real Postgres parse: running Postgres/psql was ruled out and no offline parser (pglast, sqlglot) is installed.
- `git diff --check` clean; LF endings with a final newline; the only non-ASCII characters are the em/en dashes and the ⚠️ the reference uses (no Cf/Co characters).

## Self-review

- A slip caught before the commit: my first extraction of the spec block stopped at line 100 and dropped the index's
  `  WHERE sequence IS NOT NULL;` line, and the first diff passed because it compared the same truncated range.
  I spliced the line in from the spec and re-diffed by fence markers instead of line numbers. The committed file has the full partial index.
- Re-running: the three classes columns and sprints.sequence are skipped (IF NOT EXISTS), the schedule CHECK is dropped
  and re-added, and the index is skipped. In Postgres 13+ ADD COLUMN IF NOT EXISTS checks for the column before it
  expands the column's inline CHECK, so a re-run should not add a second `sprints_sequence_check1`. I have not tested
  this against a live database. Check query 2 ("exactly one CHECK on sprints that names sequence") would catch a duplicate.
- The header's list of requests that need the columns (POST /api/classes, POST /api/projects reading the class's
  schedule, PATCH …/sprints and …/end-date; the board's snapshot read for the hours) comes from plan Tasks 4–8, not from
  code that exists yet. Task 13 may want to check it against the final code.

## Concerns

1. The expected grep count in the brief and plan (Task 1, Step 3: "prints 5 … (3 + 2)") leaves out the
   `ALTER TABLE public.sprints ADD COLUMN IF NOT EXISTS sequence …` line, which is in the spec's DDL and in the
   brief's own Interfaces list. The right count is 6 (4 + 2). I kept the DDL verbatim. The plan text should say 6.

2. The spec's verbatim CHECK `classes_sprint_schedule_valid` has a NULL hole. A CHECK passes when it evaluates to NULL,
   and with `sprint_count` or `sprint_frequency` NULL the second branch is NULL instead of false. So a start day with a
   NULL count and/or NULL frequency passes. Example: (NULL, 'weekly', '2026-09-28') gives FALSE OR (NULL AND TRUE AND TRUE),
   which is NULL, so the row is accepted. A start day missing is caught (`IS NOT NULL` is false).
   The API never writes such a row (Task 6 writes all three, and `start_date` is required, so `sprints_start_on` is never
   NULL; Task 8's PATCH requires all three). So the hole only matters for hand edits or a future bug.
   As the brief asked, I kept the DDL verbatim and wrote the header to say what the CHECK actually allows. It does not
   claim "all three or none". Suggested fix, following the team_meetings precedent ("spelled out because a CHECK passes on NULL"):

       ALTER TABLE public.classes ADD CONSTRAINT classes_sprint_schedule_valid CHECK (
         (sprint_count IS NULL AND sprint_frequency IS NULL AND sprints_start_on IS NULL)
         OR (sprint_count IS NOT NULL AND sprint_frequency IS NOT NULL AND sprints_start_on IS NOT NULL
             AND sprint_count BETWEEN 1 AND 20
             AND sprint_frequency IN ('weekly', 'biweekly', 'monthly'))
       );

   If adopted: change the spec's Part 0 block, these lines in the migration, and the header sentence ("As written it also
   passes …") in one go. It is cheap now because the file has not been applied anywhere.

3. Step 3 says to ask the maintainer to apply both files on DEV through the Supabase connector and record the date in
   each header. I did not contact the maintainer or any database. That request is yours to relay; both headers still read
   `Applied: DEV — pending   PROD — pending`.

4. Minor: the harness's default attribution for me is `Co-Authored-By: Claude Opus 5.5`. I used the trailer the
   brief and plan require (`Claude Fable 5.1`). Amend it if you want the implementer's model named.

---

# Fix round (coordinator, pre-review): tighten the schedule CHECK

Status: DONE
Commit: e3903fdd fix(db): the schedule CHECK refuses a half-set schedule
(a new commit on 1ef39881, not an amend; not pushed; trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`)

## Rulings recorded

- Concern 1 (count): the brief's 5 was a plan miscount. 6 (schedule 4 + burnup 2) is right.
- Concern 2 (NULL hole): adopted. The CHECK is tightened in the migration and the spec, below.
- Concern 4 (trailer): `Claude Fable 5.1` is the trailer this session requires.
- Still open, yours to relay: the maintainer applies both files on DEV and records the date in each header. Both headers
  still read `Applied: DEV — pending   PROD — pending`.

## What changed (2 files, +9 −6)

1. `backend/database/migrations/2026-10/2026-10-22_class_sprint_schedule.sql`
   - The second branch of `classes_sprint_schedule_valid` now opens with
     `sprint_count IS NOT NULL AND sprint_frequency IS NOT NULL`. The file's indentation is kept (OR at 2 spaces, ANDs at 6).
   - The header bullet now states the intent plainly ("all three set, or none") and why the IS NOT NULLs are spelled out,
     following the team_meetings precedent. The "As written it also passes …" caveat and "The API always writes the three
     together." are gone. I reflowed the bullet once so the backticked expression stays on one line.
2. `docs/superpowers/specs/2026-10-22-sprint-plan-docs-design.md`: the same two-line change inside the Part 0 "Class sprint
   schedule (D20)" SQL block. Nothing else in the spec or the plan restates the CHECK; the plan only names it.

The constraint now reads (in both files):

    ALTER TABLE public.classes ADD CONSTRAINT classes_sprint_schedule_valid CHECK (
      (sprint_count IS NULL AND sprint_frequency IS NULL AND sprints_start_on IS NULL)
      OR (sprint_count IS NOT NULL AND sprint_frequency IS NOT NULL
          AND sprint_count BETWEEN 1 AND 20
          AND sprint_frequency IN ('weekly', 'biweekly', 'monthly')
          AND sprints_start_on IS NOT NULL)
    );

## Commands and output

    $ grep -c "ADD COLUMN IF NOT EXISTS" backend/database/migrations/2026-10/2026-10-22_*.sql
    backend/database/migrations/2026-10/2026-10-22_class_sprint_schedule.sql:4
    backend/database/migrations/2026-10/2026-10-22_burnup_hours.sql:2

The CHECK statement, extracted from each file with
`sed -n '/^ALTER TABLE public.classes ADD CONSTRAINT classes_sprint_schedule_valid CHECK ($/,/^);$/p'`:

    $ diff <(extract spec) <(extract migration) && echo IDENTICAL
    IDENTICAL
    $ cmp <(extract spec) <(extract migration)
    cmp: same bytes (374 bytes)

The whole DDL block (the spec's fenced block vs the migration, from the first `ADD COLUMN` through `  WHERE sequence IS NOT NULL;`):

    IDENTICAL

`git diff --check`: clean.

Three-valued-logic model of the two CHECKs (Python, NULL as None; a CHECK passes on TRUE or NULL; 24 combinations of
count {NULL, 5, 0, 21} × frequency {NULL, weekly, daily} × start {NULL, a date}). This is a model, not a database run:

    spec as first written: 5 of 24 combinations pass -> [(None, None, None), (None, None, '2026-09-28'),
        (None, 'weekly', '2026-09-28'), (5, None, '2026-09-28'), (5, 'weekly', '2026-09-28')]
    tightened: 2 of 24 combinations pass -> [(None, None, None), (5, 'weekly', '2026-09-28')]

## Notes

- Applying the tightened CHECK needs no new PREFLIGHT. On a first run every row is NULL in all three columns. On a re-run
  only API-written rows exist, and those carry all three (`start_date` is required on create, so `sprints_start_on`
  always defaults to a day).

---

# Fix round 1 of 5 (review finding, Important): one sequence CHECK after a re-run

Status: DONE
Commit: 11a4ec78 fix(db): re-running the schedule migration leaves one sequence CHECK
(new commit on e3903fdd, not an amend; not pushed; trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`)

## What changed (2 files, +17 −12)

1. `backend/database/migrations/2026-10/2026-10-22_class_sprint_schedule.sql`
   - The inline-CHECK line for `sprints.sequence` is replaced by the reviewer's three lines:

         ALTER TABLE public.sprints ADD COLUMN IF NOT EXISTS sequence smallint;
         ALTER TABLE public.sprints DROP CONSTRAINT IF EXISTS sprints_sequence_check;
         ALTER TABLE public.sprints ADD CONSTRAINT sprints_sequence_check CHECK (sequence IS NULL OR sequence >= 1);

     The constraint is not named inside the ADD COLUMN.
   - Header, the idempotency sentence: "EXPAND, idempotent, one transaction: a re-run skips the columns and the index, and
     drops both CHECKs and adds them again by name, so it leaves exactly one of each." The rest of that paragraph is only reflowed.
   - Header, the sequence bullet: "(the column's CHECK, which Postgres names sprints_sequence_check)" becomes
     "(sprints_sequence_check)". The name is now explicit and no longer chosen by Postgres.
   - The post-COMMIT Check block is unchanged and still expects exactly one CHECK on sprints that names sequence,
     `sprints_sequence_check`.
2. `docs/superpowers/specs/2026-10-22-sprint-plan-docs-design.md`: the same line becomes the same three lines in the
   Part 0 "Class sprint schedule (D20)" block.

## Commands and output

    $ grep -c "ADD COLUMN IF NOT EXISTS" backend/database/migrations/2026-10/2026-10-22_*.sql
    backend/database/migrations/2026-10/2026-10-22_class_sprint_schedule.sql:4
    backend/database/migrations/2026-10/2026-10-22_burnup_hours.sql:2

The spec block (by its ```sql fence, from the first `ADD COLUMN` line to the fence) against the migration's DDL (from
the same first line through `  WHERE sequence IS NOT NULL;`):

    spec block: 16 lines, 1076 bytes; migration DDL: 16 lines, 1076 bytes
    $ cmp <(spec block) <(migration DDL)
    cmp: byte-identical

Constraints and indexes the DDL names:

    DROP CONSTRAINT IF EXISTS classes_sprint_schedule_valid
    ADD CONSTRAINT classes_sprint_schedule_valid
    DROP CONSTRAINT IF EXISTS sprints_sequence_check
    ADD CONSTRAINT sprints_sequence_check
    INDEX IF NOT EXISTS sprints_project_sequence_uq

- Statement split of the migration: 16 statements (BEGIN, SET LOCAL, 9 DDL, COMMIT, 4 check SELECTs); parentheses
  balanced; nothing after the last `;`.
- No comment line contains the grep phrase, so the count is DDL only. Comment lines are at most 104 characters.
- `git diff --check` is clean. The only non-ASCII characters are the dashes and ⚠️, as before.

## A note on the Postgres behavior (no action needed for this file)

In round 0 I wrote that Postgres 13+ checks IF NOT EXISTS before it lifts an inline CHECK out of the column, so a
re-run would not duplicate it. I marked that untested. The review says the opposite, citing pgsql-bugs #15361,
#15180 and #15670, and calls it by design. I can't settle it here: there is no database and no parser.

My recollection is this. The PG 13 ALTER TABLE restructure (commit 1281a5c9, Tom Lane, January 2020) moved the
`if_not_exists` check in ATExecAddColumn ahead of the parse transform that queues subsidiary commands. It added a
regression test that runs `ADD COLUMN IF NOT EXISTS c5 SERIAL CHECK (c5 > 8)` and then `… CHECK (c5 > 10)` and expects
one CHECK. I believe reports like #15180 and #15670 predate that change. If so, the duplicate happens on Postgres 12
and older only.

The split is idempotent on every version, so this file is right either way. Before "an inline CHECK in a guarded
ADD COLUMN duplicates on re-run" goes into AGENTS.md or memory as a general gotcha, check it on the project's
Postgres (`SELECT version();`, then a scratch table on DEV).

## Still open

The maintainer applies the file on DEV through the connector and records the date in the header; that request is yours
to relay. Both headers still read `Applied: DEV — pending   PROD — pending`.
