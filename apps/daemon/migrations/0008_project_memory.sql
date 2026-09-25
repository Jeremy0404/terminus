CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`text` text NOT NULL,
	`source_task_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lessons_app_idx` ON `lessons` (`app_id`);--> statement-breakpoint
CREATE TABLE `terms` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`term` text NOT NULL,
	`definition` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `terms_app_idx` ON `terms` (`app_id`);