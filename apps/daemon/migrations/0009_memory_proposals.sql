CREATE TABLE `memory_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`source_task_id` text NOT NULL,
	`proposed` text NOT NULL,
	`why` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `memory_proposals_app_idx` ON `memory_proposals` (`app_id`);