CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`audience` text NOT NULL,
	`problem` text NOT NULL,
	`outcome` text NOT NULL,
	`app_id` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `apps` ADD `product` text;