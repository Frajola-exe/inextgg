ALTER TABLE `products` ADD `product_type` text DEFAULT 'key' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `price_mode` text DEFAULT 'fixed' NOT NULL;