-- Add CC, BCC, and HTML body support to queued invite batches
ALTER TABLE pending_invites
    ADD COLUMN IF NOT EXISTS cc              jsonb,
    ADD COLUMN IF NOT EXISTS bcc             jsonb,
    ADD COLUMN IF NOT EXISTS custom_body_html text;
