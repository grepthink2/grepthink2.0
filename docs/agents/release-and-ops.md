# Releases and the hosted services

Read this before a release, or before running the Supabase, Vercel or Cloudflare CLI.

## Releases

- **Release notes and the version.** The newest file in `frontend/src/features/releases/notes/` must
  equal `frontend/package.json`'s `version`, and its format is checked by `releaseNotes.test.ts`. A
  release is one pull request from `beta` into `main`, and every one is tagged: its "Release version
  and notes" check (required by `main`'s ruleset) fails while `v<version>` is tagged already or the
  notes file is missing. Turn it green with one `release: <version>` commit pushed straight to `beta`
  (no pull request of its own): the notes file plus `npm --prefix frontend version <version>
  --no-git-tag-version`. Raise the minor number for anything new or improved, the patch for fixes or
  internal work only (one line under `## Improved`). After the merge into `main`,
  `.github/workflows/release.yml` tags it and publishes the GitHub release from the same file. Only a
  Dependabot security update straight into `main` keeps the version.

## Supabase, Vercel and Cloudflare CLIs: always use the project profiles

Run the CLI as `scripts/supabase.sh dev|prod <supabase args>`. Never run bare `supabase`, and
never run `supabase login`: login keeps its token in the macOS keychain, and after that every
call from another process (an editor terminal, an agent) asks for the keychain password. The
script reads a personal access token from `.supabase/access-token` (create it once with
`scripts/supabase.sh token`). It links each environment in its own working directory, so
`--linked` means the environment you named. `.supabase/` is gitignored and lives in the main
checkout, and every worktree shares it. `db dump` needs a running Docker. Dumps hold student
data, so write them outside the repo. The Supabase MCP connector reaches both projects too;
in Claude Code's auto mode, calls to PROD need the maintainer's approval.

The same goes for Vercel: `scripts/vercel.sh frontend|backend <vercel args>` (once:
`scripts/vercel.sh token`), never bare `vercel` and never `vercel login`. The token lives in
`.vercel/global/auth.json`, a repo-local global config (`--global-config`), so your
account-wide login is never used. Each project is linked under `.vercel/<frontend|backend>`.
The script refuses deploys (PROD deploys by merging to `main`). Use it for what the Vercel
connector cannot do: `env ls production`, `logs`, `rollback`.

DNS for `grepthink2.com` lives in Cloudflare, not Vercel: `scripts/cloudflare.sh verify | dns ls |
dns add | dns rm | get` (once: `scripts/cloudflare.sh token`). It takes an account API token
(Zone → DNS → Edit and Zone → Zone → Read on that zone; it refuses the Global API Key) from
`.cloudflare/api-token` and hands it to curl on stdin, never on a command line. It will not
remove or shadow the apex, www, api or email records, or add a `_vercel` TXT that verifies one
of them for another Vercel account. Reads are fine; ask the maintainer before any DNS write.
