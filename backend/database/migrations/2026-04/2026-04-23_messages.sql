-- Messages feature — 3 tables + last_message_at trigger.
-- Spec: docs/superpowers/specs/2026-04-23-messages-design.md
--
-- RLS deliberately not enabled in v1 — controllers enforce permissions.
-- Adding RLS is tracked as a follow-up in CODE_REVIEW.md #4.

CREATE TABLE conversations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a          uuid NOT NULL REFERENCES profiles(id),
    user_b          uuid NOT NULL REFERENCES profiles(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz,
    CONSTRAINT conversations_canonical_order CHECK (user_a < user_b),
    CONSTRAINT conversations_unique_pair UNIQUE (user_a, user_b)
);

CREATE INDEX conversations_user_a_idx ON conversations (user_a);
CREATE INDEX conversations_user_b_idx ON conversations (user_b);
CREATE INDEX conversations_last_message_at_idx ON conversations (last_message_at DESC NULLS LAST);

CREATE TABLE messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    sender_id       uuid NOT NULL REFERENCES profiles(id),
    body            text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT messages_body_length CHECK (char_length(body) BETWEEN 1 AND 1024)
);

CREATE INDEX messages_conv_created_idx ON messages (conversation_id, created_at DESC);

CREATE TABLE conversation_reads (
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    user_id         uuid NOT NULL REFERENCES profiles(id),
    last_read_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
);

-- Bump conversations.last_message_at on every message insert.
-- Avoids race conditions vs. doing this in application code.
CREATE OR REPLACE FUNCTION bump_conversation_last_message()
RETURNS trigger AS $$
BEGIN
    UPDATE conversations
       SET last_message_at = NEW.created_at
     WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_bump_last_message
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION bump_conversation_last_message();
