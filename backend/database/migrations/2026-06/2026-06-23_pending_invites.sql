-- Queued invite jobs: emails are held here for 60 s before delivery
-- so instructors can cancel before they go out.
CREATE TABLE IF NOT EXISTS pending_invites (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id      uuid        NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    instructor_id text        NOT NULL,
    emails        jsonb       NOT NULL,
    send_at       timestamptz NOT NULL,
    cancelled     boolean     NOT NULL DEFAULT false,
    sent          boolean     NOT NULL DEFAULT false,
    custom_subject text,
    custom_body    text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Only unsent, uncancelled rows need fast lookup by send_at
CREATE INDEX IF NOT EXISTS pending_invites_send_at_idx
    ON pending_invites (send_at)
    WHERE cancelled = false AND sent = false;
