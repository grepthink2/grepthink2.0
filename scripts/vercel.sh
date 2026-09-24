#!/usr/bin/env bash
# This project's Vercel CLI profile, the counterpart of scripts/supabase.sh. Run the CLI through
# this script, never as bare `vercel`, and never run `vercel login`:
#
#   scripts/vercel.sh token                      save a Vercel access token (once per machine)
#   scripts/vercel.sh frontend <vercel args>     the grepthink2-0-frontend project
#   scripts/vercel.sh backend  <vercel args>     the grepthink2-0-backend project
#
#   e.g. scripts/vercel.sh backend env ls production      which variables PROD has (names only)
#        scripts/vercel.sh backend logs <deployment-url>  a deployment's runtime logs
#        scripts/vercel.sh backend rollback               instant rollback to the previous deploy
#
# The token sits in .vercel/global/auth.json, the CLI's own credentials file, inside a global
# config directory that belongs to this repo (--global-config). The CLI never reads or writes
# your account-wide Vercel login, and the token never appears on a command line. Each project
# is linked in its own working directory (.vercel/frontend, .vercel/backend), so a command
# always reaches the project you named; file paths you pass are relative to that directory.
# Deploys are refused here: PROD deploys by merging to main. .vercel/ is gitignored and lives in
# the main checkout, so every git worktree shares it. The CLI runs through npx at a pinned version.
set -euo pipefail

cli_version=59.26.0 # bump deliberately; `npm view vercel version` prints the latest
team=grepthink

usage() {
  echo "usage: scripts/vercel.sh token | frontend <vercel args> | backend <vercel args>" >&2
  exit 2
}

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
main_checkout="$(dirname "$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)")"
profile_dir="$main_checkout/.vercel"
global_dir="$profile_dir/global"
auth_file="$global_dir/auth.json"

case "${1:-}" in
  token)
    mkdir -p "$global_dir"
    chmod 700 "$profile_dir" "$global_dir"
    echo "Create a token at https://vercel.com/account/settings/tokens (scope: the $team team,"
    echo "with an expiry), then paste it here."
    read -rsp "Access token (input hidden, paste once): " token
    echo
    token="$(printf '%s' "$token" | tr -d '[:space:]')"
    half=$((${#token} / 2))
    # A hidden prompt gives no feedback, so a second paste is easy to make without noticing.
    if [[ ! "$token" =~ ^[A-Za-z0-9_-]{20,}$ ]] ||
      { ((${#token} % 2 == 0)) && [[ "${token:0:half}" == "${token:half}" ]]; }; then
      echo "That is not one access token (got ${#token} characters)." >&2
      echo "Nothing saved. Run it again and paste the token once." >&2
      exit 1
    fi
    (umask 077 && printf '{\n  "// Note": "Vercel credentials for this repo only (scripts/vercel.sh). Do not share.",\n  "token": "%s"\n}\n' "$token" >"$auth_file")
    echo "Saved to $auth_file"
    exit 0
    ;;
  frontend) project=grepthink2-0-frontend ;;
  backend) project=grepthink2-0-backend ;;
  *) usage ;;
esac
target=$1
shift
(($#)) || usage
case "$1" in
  -h | --help) ;;
  deploy | -*)
    echo "Refused: PROD deploys by merging to main, not from this script." >&2
    echo "(A command that starts with a flag is a deploy too.)" >&2
    exit 2
    ;;
esac
if [[ ! -s "$auth_file" ]]; then
  echo "No Vercel token at $auth_file. Run: scripts/vercel.sh token" >&2
  exit 1
fi

export VERCEL_TELEMETRY_DISABLED=1
cli=(npx --yes "vercel@$cli_version" --global-config "$global_dir" --non-interactive)
workdir="$profile_dir/$target"
if [[ "$(cat "$workdir/.linked-project" 2>/dev/null)" != "$project" ]]; then
  mkdir -p "$workdir"
  "${cli[@]}" link --yes --team "$team" --project "$project" --cwd "$workdir" >&2
  # Linking can pull the project's development variables into an env file; none is wanted here.
  find "$workdir" -maxdepth 2 -name '.env*' -type f -delete
  printf '%s\n' "$project" >"$workdir/.linked-project"
fi
echo "vercel → $target ($project)" >&2
exec "${cli[@]}" --scope "$team" --cwd "$workdir" "$@"
