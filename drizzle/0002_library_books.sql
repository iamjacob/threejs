CREATE TABLE `library_books` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`client_key` text NOT NULL,
	`source` text NOT NULL,
	`catalog_id` text,
	`title` text NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`width_cm` real,
	`height_cm` real,
	`thickness_cm` real,
	`color` text,
	`cover_front_file_id` text,
	`cover_back_file_id` text,
	`cover_spine_file_id` text,
	`added_at` integer NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cover_front_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cover_back_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cover_spine_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_books_profile_client_key` ON `library_books` (`profile_id`,`client_key`);--> statement-breakpoint
CREATE INDEX `library_books_profile_idx` ON `library_books` (`profile_id`,`deleted_at`,`added_at`);