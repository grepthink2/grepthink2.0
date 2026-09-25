-- 2026-09-25 — institutions: the school each class belongs to
--
-- EXPAND, idempotent, one transaction. Safe on either side of the code deploy: the backend reads
-- institutions through a cached loader (app/institutions/controller.py) that keeps the behaviour
-- from before institutions (no schools; ".edu" is the only school email) while this table does
-- not exist. Update supabase/schema.sql once this is applied (AGENTS.md).
--
-- Applied: DEV ____-__-__   PROD ____-__-__
--
-- ⚠️  ORDER: apply this file, then 2026-09-25_seed_istinye.sql, BEFORE anyone creates a class
--     at a school other than UC Santa Cruz. Until this file runs no class can be given a
--     school, and its backfill labels every class that has none as UC Santa Cruz, so an
--     İstinye class created earlier would become a UCSC class. Until the seed runs, İstinye is
--     not there to pick. Either way the class then needs a hand-written UPDATE: re-running
--     this file is not a fix (see the last point below). In practice: both before
--     prod/2026-09-25_scott_class_creation.sql, since Scott's İstinye class is the first.
--
--   * institutions (name, slug, email_domains): one row per school, added by a maintainer
--     (supabase/README.md, "Institutions"). RLS on with no policies and no client privileges:
--     only the service role reads it; the backend serves the list at GET /api/institutions.
--   * classes.institution_id: nullable until a later contract step. Every existing class is
--     assigned to UC Santa Cruz, the only school GrepThink has served so far.
--   * An address counts as a school email when its domain ends in .edu, or is one of an
--     institution's email_domains, or a subdomain of one (stu.istinye.edu.tr ⊂ istinye.edu.tr).
--   * Do NOT re-run this file after the per-class-roles release: POST /api/classes takes an
--     optional institution_id, so a class can legitimately be created with none yet. The last
--     UPDATE cannot tell that apart from "predates this migration" and would relabel every such
--     class UC Santa Cruz.

BEGIN;

CREATE TABLE IF NOT EXISTS public.institutions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  slug          text        NOT NULL,
  email_domains text[]      NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT institutions_slug_key UNIQUE (slug),
  CONSTRAINT institutions_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.institutions FROM anon, authenticated;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES public.institutions (id);

CREATE INDEX IF NOT EXISTS idx_classes_institution_id ON public.classes (institution_id);

INSERT INTO public.institutions (name, slug, email_domains)
VALUES ('UC Santa Cruz', 'ucsc', '{ucsc.edu}')
ON CONFLICT (slug) DO NOTHING;

UPDATE public.classes
   SET institution_id = (SELECT id FROM public.institutions WHERE slug = 'ucsc')
 WHERE institution_id IS NULL;

COMMIT;

-- Check. Expected: one row per institution and 0 unassigned classes.
SELECT i.slug,
       array_to_string(i.email_domains, ', ')                                AS email_domains,
       (SELECT count(*) FROM public.classes c WHERE c.institution_id = i.id)  AS classes,
       (SELECT count(*) FROM public.classes c WHERE c.institution_id IS NULL) AS unassigned
  FROM public.institutions i
 ORDER BY i.slug;
