import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type { Db } from "../db/database";
import { bookAssets, files, libraryBooks, notes } from "../schema";

/**
 * DEVICE-WIDE reference checks for content-addressed blobs. Bytes are shared between profiles
 * (merge copies `files` rows, not bytes), so whether a blob is still used can only be answered
 * across every profile. These queries return ids for a yes/no decision only; callers must never
 * show their results to the active person. Used solely by storageCleanup.ts.
 */
export const blobRefRepository = {
	/** Live (not removed) manifest rows in ANY profile and any intake state for these bytes. */
	async liveAssetShas(db: Db, shas: string[]): Promise<Set<string>> {
		if (!shas.length) return new Set();
		const rows = await db
			.select({ sha: bookAssets.sha256 })
			.from(bookAssets)
			.where(
				and(inArray(bookAssets.sha256, shas), isNull(bookAssets.removedAt)),
			)
			.all();
		return new Set(rows.map((r) => r.sha));
	},
	/** Every `files` row in ANY profile that points at these bytes. */
	filesForBlobs(db: Db, shas: string[]) {
		if (!shas.length) return Promise.resolve([]);
		return db
			.select({ id: files.id, blobKey: files.blobKey })
			.from(files)
			.where(inArray(files.blobKey, shas))
			.all();
	},
	/** File ids referenced by notes or by any library book cover (deleted books included). */
	async fileIdsReferencedElsewhere(
		db: Db,
		fileIds: string[],
	): Promise<Set<string>> {
		if (!fileIds.length) return new Set();
		const noteRows = await db
			.select({ id: notes.fileId })
			.from(notes)
			.where(inArray(notes.fileId, fileIds))
			.all();
		const bookRows = await db
			.select({
				front: libraryBooks.coverFrontFileId,
				back: libraryBooks.coverBackFileId,
				spine: libraryBooks.coverSpineFileId,
			})
			.from(libraryBooks)
			.where(
				or(
					inArray(libraryBooks.coverFrontFileId, fileIds),
					inArray(libraryBooks.coverBackFileId, fileIds),
					inArray(libraryBooks.coverSpineFileId, fileIds),
				),
			)
			.all();
		const out = new Set<string>();
		for (const r of noteRows) if (r.id) out.add(r.id);
		for (const r of bookRows)
			for (const id of [r.front, r.back, r.spine]) if (id) out.add(id);
		return out;
	},
	/** File ids that are the `file_id` of a REMOVED manifest row (any profile). */
	async fileIdsOfRemovedAssets(
		db: Db,
		fileIds: string[],
	): Promise<Set<string>> {
		if (!fileIds.length) return new Set();
		const rows = await db
			.select({ id: bookAssets.fileId })
			.from(bookAssets)
			.where(
				and(
					inArray(bookAssets.fileId, fileIds),
					isNotNull(bookAssets.removedAt),
				),
			)
			.all();
		return new Set(rows.map((r) => r.id).filter((id): id is string => !!id));
	},
	/** This profile's removed manifest rows: the only candidates the cleanup may consider. */
	removedAssetsOf(db: Db, profileId: string) {
		return db
			.select({
				sha: bookAssets.sha256,
				byteSize: bookAssets.byteSize,
				kind: bookAssets.kind,
			})
			.from(bookAssets)
			.where(
				and(
					eq(bookAssets.profileId, profileId),
					isNotNull(bookAssets.removedAt),
				),
			)
			.all();
	},
};
