-- 2026-10-27 — the scrum board MCP connector's own authorization server
--
-- Apps (Claude, ChatGPT) that connect to /mcp get tokens GrepThink issues, never a Supabase token: a
-- Supabase token would let the app act on the student's whole account (it can change the password
-- through Supabase Auth). The MCP SDK serves the OAuth endpoints (/register, /authorize, /token,
-- /revoke); app/mcp/oauth.py keeps their state in these tables.
--
--   * mcp_clients: apps registered through dynamic client registration. `info` is the registration
--     as the SDK returns it (name, redirect URIs, auth method, secret for confidential clients).
--     Apps never used are deleted 24 hours after registering (by the next registration).
--   * mcp_authorizations: a pending authorization request, from /authorize until the student answers
--     on the consent page and the app redeems its code. `id` is the opaque reference in the consent
--     page's URL; the code is stored only as its SHA-256 hash and redeemed once (`used_at`).
--   * mcp_grants: one per Allow: the student, the app, and when it ends (90 days after the Allow,
--     however often the app refreshes). Revoking a grant (Settings → Connected apps, or reuse of a
--     rotated refresh token) ends every token in it.
--   * mcp_tokens: access (1 hour) and refresh tokens, stored only as SHA-256 hashes. A refresh token
--     is revoked when it is rotated.
--
-- RLS is on with no policies and the browser roles get nothing (2026-09-21 lock-down): only the
-- backend's service role reads and writes these tables.
--
-- One transaction, idempotent. Nothing reads these tables until the backend that does is deployed.
--
-- Applied: DEV 2026-10-27 (by Claude, via psql)   PROD — pending

BEGIN;

CREATE TABLE IF NOT EXISTS public.mcp_clients (
  client_id     text PRIMARY KEY,
  info          jsonb NOT NULL CHECK (pg_column_size(info) <= 8192),
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);

CREATE TABLE IF NOT EXISTS public.mcp_authorizations (
  id          text PRIMARY KEY,
  client_id   text NOT NULL REFERENCES public.mcp_clients(client_id) ON DELETE CASCADE,
  params      jsonb NOT NULL,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_hash   text UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_authorizations_expires_idx ON public.mcp_authorizations (expires_at);

CREATE TABLE IF NOT EXISTS public.mcp_grants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id    text NOT NULL REFERENCES public.mcp_clients(client_id) ON DELETE CASCADE,
  scopes       text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS mcp_grants_user_idx ON public.mcp_grants (user_id);

CREATE TABLE IF NOT EXISTS public.mcp_tokens (
  token_hash text PRIMARY KEY,
  grant_id   uuid NOT NULL REFERENCES public.mcp_grants(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('access', 'refresh')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_tokens_grant_idx ON public.mcp_tokens (grant_id);

ALTER TABLE public.mcp_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.mcp_clients, public.mcp_authorizations, public.mcp_grants, public.mcp_tokens
  FROM anon, authenticated;
GRANT ALL ON public.mcp_clients, public.mcp_authorizations, public.mcp_grants, public.mcp_tokens
  TO service_role;

COMMIT;
