CREATE TABLE `quota` (
	`id` text PRIMARY KEY NOT NULL,
	`limited` integer NOT NULL,
	`windows` text NOT NULL,
	`observed_at` text NOT NULL
);
