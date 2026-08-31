CREATE TABLE `council_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`council_id` text NOT NULL,
	`helpfulness` integer NOT NULL,
	`would_return` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`council_id`) REFERENCES `councils`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_feedback_council` ON `council_feedback` (`council_id`);--> statement-breakpoint
CREATE TABLE `councils` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` integer NOT NULL,
	`question` text NOT NULL,
	`category` text NOT NULL,
	`responses_json` text NOT NULL,
	`synthesis_json` text NOT NULL,
	`action_text` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_councils_profile_created` ON `councils` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `life_stages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`stage_order` integer NOT NULL,
	`age_label` text NOT NULL,
	`title` text NOT NULL,
	`memory` text NOT NULL,
	`value` text NOT NULL,
	`stage_type` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_life_stages_profile_order` ON `life_stages` (`profile_id`,`stage_order`);--> statement-breakpoint
CREATE TABLE `product_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer,
	`visitor_hash` text NOT NULL,
	`event_name` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_events_name_created` ON `product_events` (`event_name`,`created_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visitor_hash` text NOT NULL,
	`name` text NOT NULL,
	`current_age` integer NOT NULL,
	`consent_version` text DEFAULT '2026-08-31' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_profiles_visitor_hash` ON `profiles` (`visitor_hash`);