-- Cleanup: drop the orphaned `v_user_role` table.
--
-- A 1-column (`role`), 0-row BASE TABLE with a `v_` (view) prefix — an artifact
-- of a botched view creation. Nothing in the backend or frontend references it
-- (verified by grep), and no view / policy / function depends on it. Safe to drop
-- independently of any deploy.
DROP TABLE IF EXISTS public.v_user_role;
