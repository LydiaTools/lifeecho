CREATE TABLE `council_turns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`council_id` text NOT NULL,
	`stage_key` text NOT NULL,
	`user_message` text NOT NULL,
	`stage_reply` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`council_id`) REFERENCES `councils`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_turns_council_created` ON `council_turns` (`council_id`,`created_at`);