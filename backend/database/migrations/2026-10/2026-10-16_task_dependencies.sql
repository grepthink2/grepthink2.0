-- Task dependencies ("GT-15 depends on GT-12"), one row per edge. Both tasks must belong to
-- project_id: the controller checks it; the column makes the board's read one filter.
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  task_id            uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, depends_on_task_id),
  CONSTRAINT task_dependencies_not_self CHECK (task_id <> depends_on_task_id)
);
CREATE INDEX IF NOT EXISTS task_dependencies_project_idx    ON public.task_dependencies (project_id);
CREATE INDEX IF NOT EXISTS task_dependencies_depends_on_idx ON public.task_dependencies (depends_on_task_id);
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_dependencies FROM anon, authenticated;
