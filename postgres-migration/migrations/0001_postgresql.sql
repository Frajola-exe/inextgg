-- Compatible with the existing API: flags stay 0/1, JSON stays text,
-- monetary amounts stay integer cents and timestamps stay epoch milliseconds.
CREATE TABLE products (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  image text NOT NULL,
  price integer NOT NULL,
  old_price integer NOT NULL DEFAULT 0,
  active integer NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  automatic integer NOT NULL DEFAULT 1 CHECK (automatic IN (0, 1)),
  deleted integer NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
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

CREATE TABLE keys (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products (id),
  code text NOT NULL,
  order_id text REFERENCES orders (id)
);
CREATE UNIQUE INDEX keys_code_unique ON keys (code);
CREATE INDEX keys_available_product_idx ON keys (product_id) WHERE order_id IS NULL;
CREATE INDEX keys_order_idx ON keys (order_id);

CREATE TABLE settings (
  id text PRIMARY KEY,
  value text NOT NULL
);
