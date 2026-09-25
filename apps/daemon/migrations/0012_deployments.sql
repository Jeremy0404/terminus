CREATE TABLE `deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`version` text NOT NULL,
	`pull_request` integer NOT NULL,
	`requested_at` text NOT NULL,
	`state` text NOT NULL,
	`run_url` text,
	`finished_at` text,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `deployments_app_idx` ON `deployments` (`app_id`);