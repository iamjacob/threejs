import { and, asc, eq, isNull } from "drizzle-orm";
import { affectedRows, type Db } from "../db/database";
import { type LibraryBook, libraryBooks } from "../schema";

/** Every method requires profileId and filters on it (same rule as notes). */
export const libraryBookRepository = {
	/** Active books in stable order: oldest first, id as tie-break. */
	listActive(db: Db, profileId: string): Promise<LibraryBook[]> {
		return db
			.select()
			.from(libraryBooks)
			.where(
				and(
					eq(libraryBooks.profileId, profileId),
					isNull(libraryBooks.deletedAt),
				),
			)
			.orderBy(asc(libraryBooks.addedAt), asc(libraryBooks.id))
			.all();
	},
	/** Includes soft-deleted rows (used by promotion). */
	listAll(db: Db, profileId: string): Promise<LibraryBook[]> {
		return db
			.select()
			.from(libraryBooks)
			.where(eq(libraryBooks.profileId, profileId))
			.orderBy(asc(libraryBooks.id))
			.all();
	},
	get(db: Db, profileId: string, id: string): Promise<LibraryBook | undefined> {
		return db
			.select()
			.from(libraryBooks)
			.where(
				and(eq(libraryBooks.profileId, profileId), eq(libraryBooks.id, id)),
			)
			.get();
	},
	getByClientKey(
		db: Db,
		profileId: string,
		clientKey: string,
	): Promise<LibraryBook | undefined> {
		return db
			.select()
			.from(libraryBooks)
			.where(
				and(
					eq(libraryBooks.profileId, profileId),
					eq(libraryBooks.clientKey, clientKey),
				),
			)
			.get();
	},
	/** Insert unless the id or (profile, clientKey) exists. Returns true if inserted. */
	async insertIfAbsent(db: Db, book: LibraryBook): Promise<boolean> {
		const result = await db
			.insert(libraryBooks)
			.values(book)
			.onConflictDoNothing()
			.run();
		return affectedRows(result) > 0;
	},
	async update(
		db: Db,
		profileId: string,
		id: string,
		patch: Partial<
			Pick<
				LibraryBook,
				| "deletedAt"
				| "updatedAt"
				| "addedAt"
				| "title"
				| "author"
				| "subtitle"
				| "isbn"
				| "edition"
				| "publisher"
				| "expectedPageCount"
				| "metadataRevision"
			>
		>,
	) {
		await db
			.update(libraryBooks)
			.set(patch)
			.where(
				and(eq(libraryBooks.profileId, profileId), eq(libraryBooks.id, id)),
			);
	},
};
