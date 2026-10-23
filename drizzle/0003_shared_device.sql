CREATE TABLE `conversation_members` (
	`conversation_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`public_name` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`conversation_id`, `profile_id`),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `conversation_members_profile_idx` ON `conversation_members` (`profile_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`created_by_profile_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `device_directory` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`public_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`author_profile_id` text NOT NULL,
	`client_key` text NOT NULL,
	`body` text NOT NULL,
	`scope` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_author_client_key` ON `messages` (`author_profile_id`,`client_key`);--> statement-breakpoint
CREATE INDEX `messages_conversation_order_idx` ON `messages` (`conversation_id`,`created_at`,`id`);