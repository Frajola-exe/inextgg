-- Apply to an existing PostgreSQL/Supabase store before deploying game versions.
BEGIN;
CREATE TABLE IF NOT EXISTS public.product_variants (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES public.products(id),
  name text NOT NULL,
  price integer NOT NULL CHECK (price > 0),
  quantity integer NOT NULL CHECK (quantity >= 0),
  active integer NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_product_name_unique ON public.product_variants(product_id,name) WHERE active=1;
ALTER TABLE public.keys ADD COLUMN IF NOT EXISTS variant_id text REFERENCES public.product_variants(id);
CREATE INDEX IF NOT EXISTS keys_variant_available_idx ON public.keys(variant_id) WHERE order_id IS NULL;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_variants FROM anon, authenticated;
COMMIT;
