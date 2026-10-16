CREATE TABLE product_variants (id text PRIMARY KEY NOT NULL, product_id text NOT NULL REFERENCES products(id), name text NOT NULL, price integer NOT NULL, quantity integer NOT NULL, active integer NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE UNIQUE INDEX product_variants_product_name_unique ON product_variants(product_id,name) WHERE active=1;
--> statement-breakpoint
ALTER TABLE keys ADD COLUMN variant_id text REFERENCES product_variants(id);
--> statement-breakpoint
CREATE INDEX keys_variant_available_idx ON keys(variant_id) WHERE order_id IS NULL;
