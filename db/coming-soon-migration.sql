-- Apply to an existing PostgreSQL/Supabase store before deploying this version.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS coming_soon integer NOT NULL DEFAULT 0
  CHECK (coming_soon IN (0, 1));
