-- Optional message on student-initiated project join requests.
--
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run
--
-- Lets a student include a short note when requesting to join a project.
-- The note is shown to the project owners/admins reviewing the request.
-- Length is capped at 500 chars (matches the frontend RequestModal limit).

ALTER TABLE project_join_requests
    ADD COLUMN IF NOT EXISTS message text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'project_join_requests_message_length'
    ) THEN
        ALTER TABLE project_join_requests
            ADD CONSTRAINT project_join_requests_message_length
            CHECK (message IS NULL OR char_length(message) <= 500);
    END IF;
END $$;
