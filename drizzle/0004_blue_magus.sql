CREATE TABLE `task_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_email` text NOT NULL,
	`period_key` text NOT NULL,
	`evidence_thread_id` text,
	`evidence_subject` text,
	`evidence_sender` text,
	`evidence_date` text,
	`evidence_summary` text,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_completions_task_period_idx` ON `task_completions` (`task_id`,`period_key`);--> statement-breakpoint
CREATE INDEX `task_completions_user_completed_idx` ON `task_completions` (`user_email`,`completed_at`);