-- Apply to an existing PostgreSQL/Supabase store before deploying key types.
BEGIN;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS key_type text;
UPDATE public.products SET key_type = CASE category
  WHEN 'Steam' THEN 'steam'
  WHEN 'Xbox' THEN 'xbox'
  WHEN 'PlayStation' THEN 'psn'
END WHERE product_type = 'key' AND key_type IS NULL;
ALTER TABLE public.products ADD CONSTRAINT products_key_type_check
  CHECK (key_type IS NULL OR key_type IN ('steam', 'xbox', 'psn'));
COMMIT;
