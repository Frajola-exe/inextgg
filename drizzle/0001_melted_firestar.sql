CREATE TABLE `appmax_webhook_jobs` (
	`order_id` text PRIMARY KEY NOT NULL,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_provider` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `appmax_customer_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_state` text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `pix_expires_at` integer;