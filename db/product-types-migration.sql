-- Apply to an existing PostgreSQL/Supabase store before deploying this version.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'key';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_mode text NOT NULL DEFAULT 'fixed';
ALTER TABLE public.products ADD CONSTRAINT products_product_type_check CHECK (product_type IN ('key', 'service', 'bot'));
ALTER TABLE public.products ADD CONSTRAINT products_price_mode_check CHECK (price_mode IN ('fixed', 'negotiable'));
