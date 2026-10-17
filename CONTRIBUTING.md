# Contributing to GrepThink

Thanks for helping. The short version:

1. **Start from `beta`.** Branch from it, open a pull request back into it, and fill in the
   template: what changed, how you verified it, which gates ran. Releases go from `beta` to `main`
   separately (README, "Branches, releases and the database").
2. **Read [AGENTS.md](AGENTS.md) first.** It holds the architecture, the roles, the conventions and
   the gotchas that bite; [backend/STYLE_GUIDE.md](backend/STYLE_GUIDE.md) covers backend code.
   Larger features get a design record in `docs/superpowers/specs/` before code.
3. **Run the gates before you push** (README, "Tests and checks"). CI runs the same ones with
   coverage, and the coverage thresholds only go up.
4. **Database changes are migrations** under `backend/database/migrations/<YYYY-MM>/`, applied by
   hand; merging never changes a database (DEPLOY.md, "Database migrations").
5. **Security problems go through [SECURITY.md](SECURITY.md)**, never a public issue.

## Licence and contributor agreement

GrepThink is licensed under the GNU Affero General Public License v3.0 ([LICENSE](LICENSE)). Before
your first contribution is merged you agree to the [Contributor License Agreement](CLA.md) once,
by commenting on the pull request:

> I have read the CLA and I agree to it.

The CLA lets the project owner also offer GrepThink under other licences, which is what allows it
to be sold to an institution that cannot accept the AGPL while everyone else keeps the AGPL
version. You keep every right to your own work.
