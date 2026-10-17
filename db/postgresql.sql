-- Run once in a NEW, EMPTY Supabase database using SQL Editor as postgres.
-- Standalone setup including Appmax; do not combine with the old migration runner.
BEGIN;
SET LOCAL search_path TO public;
-- Compatible with the existing API: flags stay 0/1, JSON stays text,
-- monetary amounts stay integer cents and timestamps stay epoch milliseconds.
CREATE TABLE products (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  image text NOT NULL,
  price integer NOT NULL,
  product_type text NOT NULL DEFAULT 'key' CHECK (product_type IN ('key', 'service', 'bot')),
  price_mode text NOT NULL DEFAULT 'fixed' CHECK (price_mode IN ('fixed', 'negotiable')),
  key_type text CHECK (key_type IN ('steam', 'xbox', 'psn')),
  old_price integer NOT NULL DEFAULT 0,
  active integer NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  automatic integer NOT NULL DEFAULT 1 CHECK (automatic IN (0, 1)),
  deleted integer NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  coming_soon integer NOT NULL DEFAULT 0 CHECK (coming_soon IN (0, 1)),
  CONSTRAINT products_category_type_check CHECK (
    (product_type = 'key' AND category IN ('Steam', 'PlayStation', 'Xbox')) OR
    (product_type IN ('service', 'bot') AND category = 'Serviços')
  )
);

CREATE TABLE orders (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  email text NOT NULL,
  items text NOT NULL,
  total integer NOT NULL,
  status text NOT NULL DEFAULT 'creating',
  payment_id text,
  request_key text NOT NULL,
  qr text,
  qr_image text,
  created_at bigint NOT NULL,
  paid_at bigint,
  delivered_at bigint
);
CREATE UNIQUE INDEX orders_payment_id_unique ON orders (payment_id);
CREATE UNIQUE INDEX orders_request_key_unique ON orders (request_key);
CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC);

CREATE TABLE product_variants (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products (id),
  name text NOT NULL,
  price integer NOT NULL CHECK (price >= 0),
  quantity integer NOT NULL CHECK (quantity >= 0),
  active integer NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE UNIQUE INDEX product_variants_product_name_unique ON product_variants(product_id,name) WHERE active=1;

CREATE TABLE keys (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products (id),
  code text NOT NULL,
  order_id text REFERENCES orders (id),
  variant_id text REFERENCES product_variants (id)
);
CREATE UNIQUE INDEX keys_code_unique ON keys (code);
CREATE INDEX keys_available_product_idx ON keys (product_id) WHERE order_id IS NULL;
CREATE INDEX keys_order_idx ON keys (order_id);
CREATE INDEX keys_variant_available_idx ON keys (variant_id) WHERE order_id IS NULL;

CREATE TABLE settings (
  id text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE orders ADD COLUMN payment_provider text NOT NULL DEFAULT 'legacy';
ALTER TABLE orders ADD COLUMN appmax_customer_id text;
ALTER TABLE orders ADD COLUMN payment_state text NOT NULL DEFAULT 'idle';
ALTER TABLE orders ADD COLUMN pix_expires_at bigint;

CREATE TABLE appmax_webhook_jobs (
  order_id text PRIMARY KEY REFERENCES orders(id),
  received_at bigint NOT NULL
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE appmax_webhook_jobs ENABLE ROW LEVEL SECURITY;

-- Access is through trusted server-side PostgreSQL connections only.
REVOKE ALL ON TABLE products, product_variants, orders, keys, settings, appmax_webhook_jobs FROM anon, authenticated;
COMMIT;
