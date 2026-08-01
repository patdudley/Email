ALTER TABLE `tasks` ADD `recurrence_type` text DEFAULT 'one_time' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_every` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_unit` text;