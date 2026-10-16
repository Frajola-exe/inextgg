ALTER TABLE products ADD COLUMN key_type text CHECK (key_type IN ('steam', 'xbox', 'psn') OR key_type IS NULL);
--> statement-breakpoint
UPDATE products SET key_type = CASE category WHEN 'Steam' THEN 'steam' WHEN 'Xbox' THEN 'xbox' WHEN 'PlayStation' THEN 'psn' END WHERE product_type = 'key';
