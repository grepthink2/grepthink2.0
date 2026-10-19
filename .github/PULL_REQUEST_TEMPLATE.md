## What changed, and why

<!-- Two or three sentences. Link the issue, or the spec under docs/superpowers/specs/. -->

## How it was verified

<!-- What you ran or clicked through, and against which Supabase project. A green CI run
     shows the gates passed; say what proved the behaviour. -->

## Gates

- [ ] Backend: `ruff format --check . && ruff check . && python -m pytest --cov`
- [ ] Frontend: `npm run lint && npm run lint:design && npm run build && npm run test:coverage`
- [ ] New or changed route → matching method in `frontend/src/lib/api/<domain>.ts` and an entry in
      the agent catalog; a touched endpoint that still answers `{"message", "<resource>"}` moves to the
      current shape (`backend/STYLE_GUIDE.md`, "Response Format")
- [ ] New migration → `backend/database/migrations/<YYYY-MM>/`, applied to DEV,
      `supabase/schema.sql` updated (or the follow-up is named above), and this PR labelled
      `needs-prod-sql`
- [ ] Docs that describe the changed behaviour are updated (README, AGENTS.md, DEPLOY.md, AUTH.md)
- [ ] No secrets, student data or local plans (`docs/superpowers/plans/`) in the diff
