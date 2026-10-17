-- Move digital services and Discord bots under Serviços without changing product IDs or orders.
BEGIN;
UPDATE public.products SET category = 'Serviços'
WHERE product_type IN ('service', 'bot') AND category <> 'Serviços';
ALTER TABLE public.products ADD CONSTRAINT products_category_type_check CHECK (
  (product_type = 'key' AND category IN ('Steam', 'PlayStation', 'Xbox')) OR
  (product_type IN ('service', 'bot') AND category = 'Serviços')
);
COMMIT;
