# Sprint Plan Documents — roadmap for PRs A, B and C

**Spec:** `docs/superpowers/specs/2026-10-22-sprint-plan-docs-design.md`. PR 0's plan is
`2026-10-22-class-sprint-schedule.md`. Each PR below gets its own bite-sized plan when its predecessor
lands, written against the real response shapes (the scrum board's Part 2 precedent). Branch each off
the previous PR's branch; open onto `beta` one at a time or retarget on merge.

## PR A — documents backend and the client contract (`feat/sprint-plan-docs-backend`)

1. Migrations: `project_documents` + `project_document_revisions` + `document_save` + `scrum_next_keys`
   (spec Part 1 verbatim), `ai_credentials` (lands here so one DEV apply covers both), the PROD cron
   file for the nightly prune (D5). `ScrumFake` gains `document_save` and `scrum_next_keys`.
2. `app/documents/body.py`: the Pydantic body (limits of Part 1), link stamping from the head
   revision (D19), the import mapping (board rows → linked items), the seed (previous plan's roles,
   times, product name).
3. `app/documents/controller.py` reads: `_board_access` reuse, `get_plan` (+ `?revision=`, `ta_slots`
   from `meetings`, `ai: {enabled, source}` without a provider yet = `{false, null}`), `list_revisions`,
   `get_revision`; routes + views + models; access matrix tests.
4. Writes: `create_plan` (seed), `save_plan` (`document_save`, the `overwrote` notice), `import_plan`,
   `delete_plan` (drafts only); budgets pinned.
5. `finalize_plan` (gate incl. the no-scrum-master fallback, `HOURS_REQUIRED`, `finalized_revision`,
   once-per-revision notify) + `notify.py` (notification type, outbox kind, recipients) + events kinds.
6. `export_plan` (finalize-first, `scrum_next_keys`, bulk inserts, link write-back, burnup snapshot,
   idempotent re-export).
7. `markdown.py` + route; golden-file test.
8. `GET /classes/{id}/sprint-plans`; the summary's `plan` field; the plan rule in
   `ensure_project_sprints`'s in-use check (untouched seed exempt).
9. `lib/api/documents.ts` + types + catalog entries + `apiFacade` METHODS; AGENTS.md module and gotchas.

## PR B — the plan page (`feat/sprint-plan-page`)

1. `features/documents/utils/planBody.ts` (types, limits, ids) + `checker.ts` (every rule of the
   spec's table) + `diff.ts` (id-matched changes, word diff) with unit tests first.
2. `hooks/useSprintPlan.ts`: parallel load of plan + board, reducer, save with `base_revision`,
   `overwrote` handling, `noticeFor`-style preview handling.
3. Page skeleton + `PlanHeader` (status pill, revision line, actions, staff revision switch) +
   `CreatePlanCard`.
4. `GoalSection`, `StoriesSection` with `StoryRow`/`TaskRow` (linked read-only rows with the live
   overlay and the "changed on the board" marker), `RolesSection`, `AssignmentTable`.
5. `ScrumTimesSection` (TA slots read-only, typed rows, the TA-visit radio rule), `BurnupSection`.
6. `ChecksPanel`, `RevisionsDrawer` + `ChangeList`.
7. Finalize / Finalize & export / Export / Re-import / Delete flows with the confirm copy; Markdown
   download and copy.
8. Entry points: board header button, `SprintProgressCard` link, `TAScheduleView` badge
   (`getClassSprintPlans`); the lazy route in `App.tsx`.
9. Harness `frontend/plan-mock.html` + `plan-mock/` (git-excluded), launch config `plan-mock` on :5185;
   page tests; gates.

## PR C — AI refine and personal keys (`feat/plan-ai-refine`)

1. `app/core/llm.py` (`Provider`, `complete_json`, `THINKING_MODELS`, usage) with tests on a stubbed
   `httpx`; `ai_draft.py` refactored onto it; `AI_MODEL` default → `@cf/zai-org/glm-4.7-flash`;
   settings `AI_MODEL_REFINE`, `AI_GATEWAY_ID`, `INTEGRATIONS_KEY`; `.env.example`.
2. `app/core/secrets.py` (Fernet) + `app/ai/` credentials routes (URL fence, never return the key,
   test endpoint, per-user rate key).
3. The 10-prompt quality check granite vs glm (scratchpad script, results in the PR body; the default
   follows).
4. `app/documents/refine.py` + the refine route (quota via `ai_draft_usage`, BYOK bypass, per-user
   rate key, prompts never logged); `ai` in the plan read becomes real.
5. `lib/api/ai.ts` + catalog; `AiSettings` block in Settings with its copy.
6. `SlugSweep` (reduced-motion path, aria-live, undo) + the refine menu on unlinked story rows;
   tests; gates.
