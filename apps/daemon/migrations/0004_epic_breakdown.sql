ALTER TABLE `epics` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `epics` ADD `breakdown` text DEFAULT '{"status":"idle"}' NOT NULL;