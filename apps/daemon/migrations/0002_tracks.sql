ALTER TABLE `decisions` ADD `kind` text DEFAULT 'question' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `track` text DEFAULT 'standard' NOT NULL;