CREATE TABLE `book_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`book_id` text NOT NULL,
	`kind` text NOT NULL,
	`role` text,
	`page_index` integer,
	`file_id` text,
	`sha256` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`original_name` text,
	`provenance` text NOT NULL,
	`rights_note` text,
	`intake` text NOT NULL,
	`last_error` text,
	`removed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`book_id`) REFERENCES `library_books`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `book_assets_book_idx` ON `book_assets` (`profile_id`,`book_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `book_assets_dedupe` ON `book_assets` (`profile_id`,`book_id`,`kind`,`sha256`);--> statement-breakpoint
CREATE TABLE `sync_states` (
	`profile_id` text NOT NULL,
	`target` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`acked_revision` integer,
	`acked_sha256` text,
	`acked_at` integer NOT NULL,
	`remote_version` text,
	PRIMARY KEY(`profile_id`, `target`, `entity`, `entity_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `library_books` ADD `subtitle` text;--> statement-breakpoint
ALTER TABLE `library_books` ADD `isbn` text;--> statement-breakpoint
ALTER TABLE `library_books` ADD `edition` text;--> statement-breakpoint
ALTER TABLE `library_books` ADD `publisher` text;--> statement-breakpoint
ALTER TABLE `library_books` ADD `expected_page_count` integer;--> statement-breakpoint
ALTER TABLE `library_books` ADD `metadata_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `library_books` ADD `catalog_match` text DEFAULT 'unmatched' NOT NULL;--> statement-breakpoint
UPDATE `library_books` SET `catalog_match` = 'candidate' WHERE `source` = 'catalog' AND `catalog_id` IS NOT NULL;