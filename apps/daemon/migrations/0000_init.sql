CREATE TABLE `apps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`repo_path` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checkpoints` (
	`task_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`phase_index` integer NOT NULL,
	`ref` text NOT NULL,
	`session_id` text,
	`taken_at` text NOT NULL,
	PRIMARY KEY(`task_id`, `sequence`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`phase_index` integer NOT NULL,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`answer` text,
	`created_at` text NOT NULL,
	`answered_at` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `decisions_task_idx` ON `decisions` (`task_id`);--> statement-breakpoint
CREATE TABLE `epics` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `epics_app_idx` ON `epics` (`app_id`);--> statement-breakpoint
CREATE TABLE `playbook_versions` (
	`lifecycle_id` text NOT NULL,
	`version` text NOT NULL,
	`phases` text NOT NULL,
	PRIMARY KEY(`lifecycle_id`, `version`)
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`phase_index` integer NOT NULL,
	`session_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`input_tokens` integer,
	`output_tokens` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `runs_task_idx` ON `runs` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_dependencies` (
	`task_id` text NOT NULL,
	`depends_on` text NOT NULL,
	PRIMARY KEY(`task_id`, `depends_on`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`depends_on`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`epic_id` text NOT NULL,
	`title` text NOT NULL,
	`lifecycle_id` text NOT NULL,
	`lifecycle_version` text NOT NULL,
	`autonomy` text NOT NULL,
	`phase_index` integer NOT NULL,
	`status` text NOT NULL,
	`failures_in_phase` text NOT NULL,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_epic_idx` ON `tasks` (`epic_id`);