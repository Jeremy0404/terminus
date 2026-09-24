ALTER TABLE `apps` ADD `verification` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `runs` ADD `output` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `check_failures` text DEFAULT '[]' NOT NULL;