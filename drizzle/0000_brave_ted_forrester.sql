CREATE TABLE `stripe_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`processed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`user_email` text PRIMARY KEY NOT NULL,
	`stripe_subscription_id` text NOT NULL,
	`stripe_price_id` text,
	`status` text NOT NULL,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_stripe_id_idx` ON `subscriptions` (`stripe_subscription_id`);--> statement-breakpoint
CREATE TABLE `usage_months` (
	`user_email` text NOT NULL,
	`period_start` text NOT NULL,
	`ai_answers` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_email`, `period_start`),
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`stripe_customer_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_stripe_customer_idx` ON `users` (`stripe_customer_id`);