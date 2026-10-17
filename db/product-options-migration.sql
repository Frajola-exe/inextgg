-- Allow zero-priced options for products whose price is negotiated with support.
-- Existing option and key records are preserved.
BEGIN;
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS product_variants_price_check;
ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_price_check CHECK (price >= 0);
COMMIT;
