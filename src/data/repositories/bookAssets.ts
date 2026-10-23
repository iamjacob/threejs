import { and, asc, eq, isNull } from "drizzle-orm";
import { affectedRows, type Db } from "../db/database";
import {
	type BookAsset,
	bookAssets,
	type SyncState,
	syncStates,
} from "../schema";

/** Every method requires profileId and filters on it. */
export const bookAssetRepository = {
	listForBook(db: Db, profileId: string, bookId: string): Promise<BookAsset[]> {
		return db
			.select()
			.from(bookAssets)
			.where(
				and(
					eq(bookAssets.profileId, profileId),
					eq(bookAssets.bookId, bookId),
					isNull(bookAssets.removedAt),
				),
			)
			.orderBy(
				asc(bookAssets.kind),
				asc(bookAssets.pageIndex),
				asc(bookAssets.createdAt),
			)
			.all();
	},
	get(db: Db, profileId: string, id: string): Promise<BookAsset | undefined> {
		return db
			.select()
			.from(bookAssets)
			.where(and(eq(bookAssets.profileId, profileId), eq(bookAssets.id, id)))
			.get();
	},
	/** The (book, kind, sha256) row, including removed ones (a re-add restores it). */
	getBySha(
		db: Db,
		profileId: string,
		bookId: string,
		kind: BookAsset["kind"],
		sha256: string,
	): Promise<BookAsset | undefined> {
		return db
			.select()
			.from(bookAssets)
			.where(
				and(
					eq(bookAssets.profileId, profileId),
					eq(bookAssets.bookId, bookId),
					eq(bookAssets.kind, kind),
					eq(bookAssets.sha256, sha256),
				),
			)
			.get();
	},
	async insertIfAbsent(db: Db, row: BookAsset): Promise<boolean> {
		const result = await db
			.insert(bookAssets)
			.values(row)
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
				BookAsset,
				| "intake"
				| "lastError"
				| "removedAt"
				| "updatedAt"
				| "pageIndex"
				| "fileId"
			>
		>,
	) {
		await db
			.update(bookAssets)
			.set(patch)
			.where(and(eq(bookAssets.profileId, profileId), eq(bookAssets.id, id)));
	},
	/** Live (not removed) rows anywhere in this profile pointing at the same bytes. */
	async liveRefsToSha(
		db: Db,
		profileId: string,
		sha256: string,
	): Promise<number> {
		const rows = await db
			.select({ id: bookAssets.id })
			.from(bookAssets)
			.where(
				and(
					eq(bookAssets.profileId, profileId),
					eq(bookAssets.sha256, sha256),
					isNull(bookAssets.removedAt),
				),
			)
			.all();
		return rows.length;
	},
};

export const syncStateRepository = {
	/** Real remote acknowledgements for this profile. Empty until a backend exists. */
	list(db: Db, profileId: string): Promise<SyncState[]> {
		return db
			.select()
			.from(syncStates)
			.where(eq(syncStates.profileId, profileId))
			.all();
	},
};
