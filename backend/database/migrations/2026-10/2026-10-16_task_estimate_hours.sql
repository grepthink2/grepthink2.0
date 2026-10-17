-- Task estimates become whole hours (1–15). Expand step: the legacy text columns stay until
-- 2026-10-16_task_estimate_hours_contract.sql runs, after this code is live.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS estimate_hours smallint;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_estimate_hours_valid;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_estimate_hours_valid
  CHECK (estimate_hours IS NULL OR estimate_hours BETWEEN 1 AND 15);

-- Only a value already written as whole hours ("4h", " 10h ") within the cap converts (maintainer
-- 2026-10-16: "wipe all estimates that are not in '1h' formats"). Everything else stays NULL.
UPDATE public.tasks
SET estimate_hours = (regexp_match(time_estimate, '^\s*(\d{1,2})\s*h\s*$'))[1]::smallint
WHERE estimate_hours IS NULL
  AND time_estimate ~ '^\s*\d{1,2}\s*h\s*$'
  AND (regexp_match(time_estimate, '^\s*(\d{1,2})\s*h\s*$'))[1]::int BETWEEN 1 AND 15;
