// Drizzle schema: the single source of truth for SQLite tables.
// Change it, then run `npm run db:generate` and commit the new drizzle/ migration.
// Personal rows always carry profile_id; repositories filter on it.
import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
};

/** One row per person on this device. A guest exists from first launch. */
export const profiles = sqliteTable("profiles", {
	id: text("id").primaryKey(),
	kind: text("kind", { enum: ["guest", "account"] }).notNull(),
	displayName: text("display_name").notNull(),
	/** Remote account id once linked. Null for guests and not-yet-linked accounts. */
	remoteAccountId: text("remote_account_id"),
	/** Set when a guest has been promoted. Guest rows are kept, not deleted. */
	mergedInto: text("merged_into"),
	...timestamps,
});

/** Device-level key/value (e.g. active profile). Not personal data. */
export const appState = sqliteTable("app_state", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
});

/** Minimal CRUD vertical slice. */
export const notes = sqliteTable(
	"notes",
	{
		id: text("id").primaryKey(),
		profileId: text("profile_id")
			.notNull()
			.references(() => profiles.id),
		/** Stable natural key used to detect duplicates when merging profiles. */
		clientKey: text("client_key").notNull(),
		title: text("title").notNull(),
		body: text("body").notNull().default(""),
		/** Optional attached image; bytes live in the FileStore. */
		fileId: text("file_id"),
		/** Added in migration 0001 to prove upgrades from the prior schema. */
		pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
		deletedAt: integer("deleted_at"),
		...timestamps,
	},
	(t) => [
		index("notes_profile_idx").on(t.profileId, t.deletedAt, t.updatedAt),
		uniqueIndex("notes_profile_client_key").on(t.profileId, t.clientKey),
	],
);

/** Metadata + stable reference for binary files. Bytes are never stored here. */
export const files = sqliteTable(
	"files",
	{
		id: text("id").primaryKey(),
		profileId: text("profile_id")
			.notNull()
			.references(() => profiles.id),
		/** Content-addressed key in the FileStore (sha256 hex). Immutable. */
		blobKey: text("blob_key").notNull(),
		mimeType: text("mime_type").notNull(),
		byteSize: integer("byte_size").notNull(),
		width: integer("width"),
		height: integer("height"),
		...timestamps,
	},
	(t) => [index("files_profile_idx").on(t.profileId)],
);

/** Local sync boundary. Written in the same transaction as the change it describes. */
export const outbox = sqliteTable(
	"outbox",
	{
		id: text("id").primaryKey(),
		profileId: text("profile_id").notNull(),
		entity: text("entity").notNull(),
		entityId: text("entity_id").notNull(),
		op: text("op", { enum: ["create", "update", "delete", "merge"] }).notNull(),
		payloadJson: text("payload_json").notNull(),
		idempotencyKey: text("idempotency_key").notNull(),
		status: text("status", { enum: ["pending", "done", "failed"] })
			.notNull()
			.default("pending"),
		attempts: integer("attempts").notNull().default(0),
		nextAttemptAt: integer("next_attempt_at").notNull(),
		lastError: text("last_error"),
		...timestamps,
	},
	(t) => [
		uniqueIndex("outbox_idempotency_key").on(t.idempotencyKey),
		index("outbox_due_idx").on(t.status, t.nextAttemptAt),
	],
);

/** Idempotency record for guest → account promotion. */
export const profileMerges = sqliteTable("profile_merges", {
	id: text("id").primaryKey(),
	sourceProfileId: text("source_profile_id").notNull(),
	targetProfileId: text("target_profile_id").notNull(),
	status: text("status", { enum: ["completed"] }).notNull(),
	reportJson: text("report_json").notNull(),
	...timestamps,
});

/**
 * A profile's library membership (migration 0002). Catalog books stay shared in the bundle and are
 * referenced by `catalogId`; scanned books are personal and their covers are `files` rows.
 * `clientKey` = 'catalog:<catalogId>' | 'scan:<legacyScanId>' is the natural key used for
 * idempotent import and for merge conflict detection.
 */
export const libraryBooks = sqliteTable(
	"library_books",
	{
		id: text("id").primaryKey(),
		profileId: text("profile_id")
			.notNull()
			.references(() => profiles.id),
		clientKey: text("client_key").notNull(),
		source: text("source", { enum: ["catalog", "scan"] }).notNull(),
		catalogId: text("catalog_id"),
		title: text("title").notNull(),
		author: text("author").notNull().default(""),
		widthCm: real("width_cm"),
		heightCm: real("height_cm"),
		thicknessCm: real("thickness_cm"),
		color: text("color"),
		coverFrontFileId: text("cover_front_file_id").references(() => files.id),
		coverBackFileId: text("cover_back_file_id").references(() => files.id),
		coverSpineFileId: text("cover_spine_file_id").references(() => files.id),
		addedAt: integer("added_at").notNull(),
		deletedAt: integer("deleted_at"),
		...timestamps,
	},
	(t) => [
		uniqueIndex("library_books_profile_client_key").on(
			t.profileId,
			t.clientKey,
		),
		index("library_books_profile_idx").on(t.profileId, t.deletedAt, t.addedAt),
	],
);

/** Per-profile settings. Seam for moving localStorage keys (e.g. boooks-shelf-level) later. */
export const profileSettings = sqliteTable(
	"profile_settings",
	{
		profileId: text("profile_id")
			.notNull()
			.references(() => profiles.id),
		key: text("key").notNull(),
		valueJson: text("value_json").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(t) => [primaryKey({ columns: [t.profileId, t.key] })],
);

export type Profile = typeof profiles.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type FileRecord = typeof files.$inferSelect;
export type OutboxEntry = typeof outbox.$inferSelect;
export type LibraryBook = typeof libraryBooks.$inferSelect;
