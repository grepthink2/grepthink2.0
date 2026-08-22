-- Scrum board D8 revision: per-project repo registry with write-only tokens.
-- Teams register their repo URL(s); an optional access token is used by the
-- backend for PR/MR state fetches (falls back to env token, then anonymous).
-- Tokens are service-role-only data — no API ever returns them (has_token only).
-- Spec: docs/superpowers/specs/2026-08-12-scrum-board-design.md (D8, amended 2026-08-21).
-- Idempotent; applied manually via Supabase MCP (dev first) on maintainer go-ahead.
-- RLS on, no policies: service-role backend only.

CREATE TABLE IF NOT EXISTS scrum_repos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repo_url     text NOT NULL CHECK (char_length(repo_url) <= 500),
  provider     text NOT NULL,
  access_token text CHECK (char_length(access_token) <= 200),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scrum_repos_provider_valid CHECK (provider IN ('github','gitlab')),
  CONSTRAINT scrum_repos_url_uq UNIQUE (project_id, repo_url)
);
CREATE INDEX IF NOT EXISTS scrum_repos_project_idx ON scrum_repos (project_id);
ALTER TABLE scrum_repos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE scrum_repos TO anon, authenticated, service_role;
