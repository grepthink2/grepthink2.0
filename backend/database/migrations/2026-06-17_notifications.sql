-- Notifications table for GrepThink 2.0
--
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run
--
-- Powers the header bell (join requests, messages, project events,
-- profile/roster reminders). Access is enforced in the FastAPI backend,
-- not via RLS (same pattern as the messages tables).

CREATE TABLE IF NOT EXISTS notifications (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type        text NOT NULL,
    title       text NOT NULL,
    body        text NOT NULL,
    entity_type text,
    entity_id   text,
    read_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
    ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
    ON notifications (user_id)
    WHERE read_at IS NULL;
