CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`blob_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `files_profile_idx` ON `files` (`profile_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`client_key` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`file_id` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notes_profile_idx` ON `notes` (`profile_id`,`deleted_at`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notes_profile_client_key` ON `notes` (`profile_id`,`client_key`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`op` text NOT NULL,
	`payload_json` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_idempotency_key` ON `outbox` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `outbox_due_idx` ON `outbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `profile_merges` (
	`id` text PRIMARY KEY NOT NULL,
	`source_profile_id` text NOT NULL,
	`target_profile_id` text NOT NULL,
	`status` text NOT NULL,
	`report_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_settings` (
	`profile_id` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `key`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`remote_account_id` text,
	`merged_into` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
