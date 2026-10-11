#!/usr/bin/env bash
# This project's Cloudflare profile, the counterpart of scripts/supabase.sh and scripts/vercel.sh.
# Cloudflare is grepthink2.com's registrar and DNS host; Vercel only serves the sites behind
# DNS-only records, so DNS changes happen here (or in the Cloudflare dashboard), never in Vercel:
#
#   scripts/cloudflare.sh token                       save an account API token (once per machine)
#   scripts/cloudflare.sh verify                      check the token and the zone it reaches
#   scripts/cloudflare.sh dns ls [name]               list the zone's records, or one name's
#   scripts/cloudflare.sh dns add <type> <name> <content> [--proxied]
#   scripts/cloudflare.sh dns rm <record-id>
#   scripts/cloudflare.sh get <api path>              any read-only call; :zone and :account expand
#
#   e.g. scripts/cloudflare.sh dns add CNAME tasks 0123abcd.vercel-dns-017.com
#        scripts/cloudflare.sh dns add TXT _vercel 'vc-domain-verify=tasks.grepthink2.com,…'
#        scripts/cloudflare.sh get /zones/:zone/settings/ssl
#
# Names are relative to the zone: `tasks` is tasks.grepthink2.com and `@` is the apex. Records are
# DNS only unless --proxied, which is what Vercel expects.
#
# Use an ACCOUNT API token (dashboard: Manage account → Account API tokens) with Zone → DNS → Edit
# and Zone → Zone → Read on grepthink2.com only, never the Global API Key. Account tokens cannot
# call the Registrar API, so renewals stay in the dashboard. The token sits in
# .cloudflare/api-token and reaches curl through a config on stdin, so it never appears on a
# command line. .cloudflare/ is gitignored and lives in the main checkout, so every git worktree
# shares it.
#
# The apex, www and api records serve PROD, and the _dmarc and *._domainkey records keep email
# deliverable: this script will not remove them or add A/AAAA/CNAME records beside them. The
# apex, www and api are already verified for our Vercel team, so a new `_vercel` TXT for one of
# them can only be another account's claim, and is refused too.
set -euo pipefail

zone_name=grepthink2.com
api=https://api.cloudflare.com/client/v4
protected=("$zone_name" "www.$zone_name" "api.$zone_name")

usage() {
  echo "usage: scripts/cloudflare.sh token | verify | dns ls [name]" >&2
  echo "       | dns add <type> <name> <content> [--proxied] | dns rm <record-id> | get <api path>" >&2
  exit 2
}

# Scannable tokens are cfat_ (account) or cfut_ (user) plus 40 characters and a checksum; older
# tokens are exactly 40 characters. cfk_ is the Global API Key, which this script refuses.
token_pattern='^(cf(at|ut)_[A-Za-z0-9_-]{40,}|[A-Za-z0-9_-]{40})$'

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
main_checkout="$(dirname "$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)")"
profile_dir="$main_checkout/.cloudflare"
token_file="$profile_dir/api-token"
ids_file="$profile_dir/zone" # "<zone id> <account id>", cached by the first lookup

die() {
  printf '%s\n' "$@" >&2
  exit 1
}

if [[ "${1:-}" == token ]]; then
  mkdir -p "$profile_dir"
  chmod 700 "$profile_dir"
  echo "Create a token in the Cloudflare dashboard: Manage account → Account API tokens → Create"
  echo "Token, with Zone → DNS → Edit and Zone → Zone → Read on $zone_name. Then paste it here."
  read -rsp "API token (input hidden, paste once): " token
  echo
  token="$(printf '%s' "$token" | tr -d '[:space:]')"
  half=$((${#token} / 2))
  if [[ "$token" == cfk_* ]]; then
    die "That is the Global API Key, which can do anything on the account. Nothing saved." \
      "Create a scoped account API token instead."
  fi
  # A hidden prompt gives no feedback, so a second paste is easy to make without noticing.
  if [[ ! "$token" =~ $token_pattern ]] ||
    { ((${#token} % 2 == 0)) && [[ "${token:0:half}" == "${token:half}" ]]; }; then
    die "That is not one API token (got ${#token} characters)." \
      "Nothing saved. Run it again and paste the token once."
  fi
  (umask 077 && printf '%s\n' "$token" >"$token_file")
  chmod 600 "$token_file"
  rm -f "$ids_file"
  echo "Saved to $token_file. Check it with: scripts/cloudflare.sh verify"
  exit 0
fi

case "${1:-}" in verify | dns | get) ;; *) usage ;; esac
command -v jq >/dev/null || die "scripts/cloudflare.sh needs jq."
[[ -s "$token_file" ]] || die "No API token at $token_file. Run: scripts/cloudflare.sh token"
token="$(tr -d '[:space:]' <"$token_file")"
[[ "$token" =~ $token_pattern ]] ||
  die "$token_file does not hold exactly one API token. Run: scripts/cloudflare.sh token"

call() { # call <method> <path> [json body]: the raw response
  local args=(-sS -X "$1" "$api$2" -H 'Content-Type: application/json')
  (($# > 2)) && args+=(--data-binary "$3")
  printf 'header = "Authorization: Bearer %s"\n' "$token" | curl --config - "${args[@]}"
}

cf() { # cf <method> <path> [json body]: the response, or Cloudflare's errors and exit 1
  local body
  body="$(call "$@")"
  if [[ "$(jq -r '.success' <<<"$body" 2>/dev/null)" == true ]]; then
    printf '%s\n' "$body"
    return
  fi
  echo "Cloudflare refused $1 $2:" >&2
  jq -r '.errors[]? | "  \(.code): \(.message)"' <<<"$body" >&2 2>/dev/null || printf '%s\n' "$body" >&2
  exit 1
}

load_ids() { # sets zone_id and account_id
  if [[ -s "$ids_file" ]]; then
    read -r zone_id account_id <"$ids_file"
    return
  fi
  local body
  body="$(cf GET "/zones?name=$zone_name")"
  zone_id="$(jq -r '.result[0].id // empty' <<<"$body")"
  account_id="$(jq -r '.result[0].account.id // empty' <<<"$body")"
  [[ -n "$zone_id" ]] || die "The token cannot see $zone_name. Give it Zone → Zone → Read on that zone."
  printf '%s %s\n' "$zone_id" "$account_id" >"$ids_file"
}

fqdn() { # a zone-relative name (`tasks`, `@`) as a full name
  local name="${1%.}"
  case "$name" in
    @ | "$zone_name") printf '%s' "$zone_name" ;;
    *."$zone_name") printf '%s' "$name" ;;
    *) printf '%s.%s' "$name" "$zone_name" ;;
  esac
}

is_protected() {
  local name
  for name in "${protected[@]}"; do [[ "$1" == "$name" ]] && return 0; done
  [[ "$1" == "_dmarc.$zone_name" || "$1" == *"._domainkey.$zone_name" ]]
}

claims_protected() { # claims_protected <name> <content>: a _vercel TXT that verifies a PROD name
  local value="${2//\"/}"
  [[ "$1" == "_vercel.$zone_name" && "$value" == vc-domain-verify=* ]] || return 1
  value="${value#vc-domain-verify=}"
  is_protected "${value%%,*}"
}

command=${1:-}
(($#)) && shift
case "$command" in
  verify)
    (($# == 0)) || usage
    load_ids
    body="$(call GET "/accounts/$account_id/tokens/verify")"
    if [[ "$(jq -r '.success' <<<"$body" 2>/dev/null)" != true ]]; then
      body="$(cf GET /user/tokens/verify)" # a user token, not an account one
    fi
    jq -r '.result | "token \(.status), expires \(.expires_on // "never")"' <<<"$body"
    echo "zone $zone_name ($zone_id), account $account_id"
    ;;
  dns)
    sub=${1:-}
    (($#)) && shift
    load_ids
    case "$sub" in
      ls)
        (($# <= 1)) || usage
        path="/zones/$zone_id/dns_records?per_page=500"
        (($#)) && path+="&name=$(fqdn "$1")"
        cf GET "$path" |
          jq -r '.result | sort_by(.name, .type)[]
            | [.id, .type, .name, (if .proxiable | not then "-" elif .proxied then "proxied" else "dns-only" end), .content]
            | @tsv' |
          column -t -s $'\t'
        ;;
      add)
        (($# == 3)) || { (($# == 4)) && [[ "$4" == --proxied ]]; } || usage
        type="$(tr '[:lower:]' '[:upper:]' <<<"$1")"
        name="$(fqdn "$2")"
        content=$3
        proxied=false
        (($# == 4)) && proxied=true
        if is_protected "$name" && [[ "$type" =~ ^(A|AAAA|CNAME)$ ]]; then
          die "Refused: $name serves PROD or email. Change its records in the Cloudflare dashboard."
        fi
        claims_protected "$name" "$content" &&
          die "Refused: that TXT verifies a PROD name for another Vercel account, which could then claim it."
        json="$(jq -nc --arg type "$type" --arg name "$name" --arg content "$content" --argjson proxied "$proxied" \
          '{type: $type, name: $name, content: $content, ttl: 1}
            + (if $type == "A" or $type == "AAAA" or $type == "CNAME" then {proxied: $proxied} else {} end)')"
        cf POST "/zones/$zone_id/dns_records" "$json" |
          jq -r '.result | "added \(.id)  \(.type)  \(.name)  \(.content)"'
        ;;
      rm)
        (($# == 1)) || usage
        [[ "$1" =~ ^[0-9a-f]{32}$ ]] || die "A record id is 32 hex characters (see: dns ls)."
        record="$(cf GET "/zones/$zone_id/dns_records/$1")"
        summary="$(jq -r '.result | "\(.type)  \(.name)  \(.content)"' <<<"$record")"
        name="$(jq -r '.result.name' <<<"$record")"
        if is_protected "$name" || claims_protected "$name" "$(jq -r '.result.content' <<<"$record")"; then
          die "Refused: $summary serves PROD or email. Remove it in the Cloudflare dashboard if you mean to."
        fi
        cf DELETE "/zones/$zone_id/dns_records/$1" >/dev/null
        echo "removed $1  $summary"
        ;;
      *) usage ;;
    esac
    ;;
  get)
    (($# == 1)) || usage
    load_ids
    path="${1//:zone/$zone_id}"
    path="${path//:account/$account_id}"
    [[ "$path" == /* ]] || path="/$path"
    cf GET "$path" | jq .
    ;;
  *) usage ;;
esac
