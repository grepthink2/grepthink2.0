#!/usr/bin/env bash
# This project's Supabase CLI profile. Run the CLI through this script, never as bare
# `supabase`, and never run `supabase login`:
#
#   scripts/supabase.sh token                  save a personal access token (once per machine)
#   scripts/supabase.sh dev  <supabase args>   run against DEV  (jfbagjjvryqcwxsyeyeg)
#   scripts/supabase.sh prod <supabase args>   run against PROD (yfezwtoeoexfksvbpxmi)
#
#   e.g. scripts/supabase.sh dev db dump --linked --schema public -f /tmp/dev-schema.sql
#
# `supabase login` keeps its token in the macOS login keychain. After that, a call from any
# other process (an editor's terminal, an agent) raises a keychain password prompt. This
# script keeps the token in .supabase/access-token and passes it as SUPABASE_ACCESS_TOKEN,
# which the CLI reads before it looks at the keychain. Each environment is linked in its own
# working directory (.supabase/dev, .supabase/prod), so `--linked` always means the one you
# named, and nothing is written to the repo's supabase/ folder. .supabase/ is gitignored and
# lives in the main checkout, so every git worktree shares one token.
set -euo pipefail

usage() {
  echo "usage: scripts/supabase.sh token | dev <supabase args> | prod <supabase args>" >&2
  exit 2
}

absolute() {
  if [[ "$1" == /* ]]; then printf '%s' "$1"; else printf '%s/%s' "$PWD" "$1"; fi
}

# The CLI's own check. Pasting into a hidden prompt gives no feedback, so a second paste
# is easy to make without noticing: refuse anything that is not exactly one token.
token_pattern='^sbp_(oauth_)?[0-9a-f]{40}$'

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
main_checkout="$(dirname "$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)")"
profile_dir="$main_checkout/.supabase"
token_file="$profile_dir/access-token"

case "${1:-}" in
  token)
    mkdir -p "$profile_dir"
    chmod 700 "$profile_dir"
    echo "Create a token at https://supabase.com/dashboard/account/tokens and paste it here."
    read -rsp "Access token (input hidden, paste once): " token
    echo
    token="$(printf '%s' "$token" | tr -d '[:space:]')"
    if [[ ! "$token" =~ $token_pattern ]]; then
      echo "That is not one access token: expected sbp_ and 40 hex characters, got ${#token} characters." >&2
      echo "Nothing saved. Run it again and paste the token once." >&2
      exit 1
    fi
    (umask 077 && printf '%s\n' "$token" >"$token_file")
    echo "Saved to $token_file"
    exit 0
    ;;
  dev) ref=jfbagjjvryqcwxsyeyeg ;;
  prod) ref=yfezwtoeoexfksvbpxmi ;;
  *) usage ;;
esac
env_name=$1
shift
(($#)) || usage

if [[ ! -s "$token_file" ]]; then
  echo "No access token at $token_file. Run: scripts/supabase.sh token" >&2
  exit 1
fi
SUPABASE_ACCESS_TOKEN="$(tr -d '[:space:]' <"$token_file")"
if [[ ! "$SUPABASE_ACCESS_TOKEN" =~ $token_pattern ]]; then
  echo "$token_file does not hold exactly one access token. Run: scripts/supabase.sh token" >&2
  exit 1
fi
export SUPABASE_ACCESS_TOKEN

# --workdir makes the CLI change into that directory, so a relative `db dump -f` path would
# land there instead of where the command was run. Make it absolute first.
if [[ "${1:-}" == db && "${2:-}" == dump ]]; then
  args=()
  while (($#)); do
    case "$1" in
      -f | --file)
        args+=("$1" "$(absolute "${2:?"$1 needs a path"}")")
        shift 2
        ;;
      --file=*)
        args+=("--file=$(absolute "${1#--file=}")")
        shift
        ;;
      *)
        args+=("$1")
        shift
        ;;
    esac
  done
  set -- "${args[@]}"
fi

workdir="$profile_dir/$env_name"
if [[ "$(cat "$workdir/supabase/.temp/project-ref" 2>/dev/null)" != "$ref" ]]; then
  mkdir -p "$workdir"
  supabase link --workdir "$workdir" --project-ref "$ref" </dev/null >&2
fi
echo "supabase → $env_name ($ref)" >&2
exec supabase --workdir "$workdir" "$@"
