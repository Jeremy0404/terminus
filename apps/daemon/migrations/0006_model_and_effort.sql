CREATE TABLE `agent_defaults` (
	`phase_id` text PRIMARY KEY NOT NULL,
	`model` text,
	`effort` text
);
--> statement-breakpoint
ALTER TABLE `runs` ADD `model` text;--> statement-breakpoint
ALTER TABLE `runs` ADD `effort` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `model` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `effort` text;