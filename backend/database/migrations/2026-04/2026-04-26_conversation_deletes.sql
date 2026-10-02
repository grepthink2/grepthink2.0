-- Per-user conversation hide. Delete acts as "hide until next activity":
-- a conversation reappears in the caller's inbox when last_message_at > deleted_at.
-- Spec: docs/superpowers/specs/2026-04-26-messages-ui-polish-design.md §4

CREATE TABLE conversation_deletes (
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    user_id         uuid NOT NULL REFERENCES profiles(id),
    deleted_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
);
