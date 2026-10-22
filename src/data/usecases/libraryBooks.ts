import { fileRepository } from "../repositories/files";
import { libraryBookRepository } from "../repositories/libraryBooks";
import type { FileRecord, LibraryBook } from "../schema";
import { type DataContext, NotFoundError, ValidationError } from "./context";
import { recordChange } from "./notes";

/** Minimal shape of a shared catalog entry (from public/books.json via getShelfBooks). */
export type CatalogBookRef = {
	id: string;
	title: string;
	author: string;
	/** Centimeters. */
	size?: { width: number; height: number; thickness: number };
};

export type LibraryBookView = LibraryBook & {
	/** Cover file metadata for scans (same profile). Catalog covers resolve from the bundle. */
	covers: { front?: FileRecord; back?: FileRecord; spine?: FileRecord };
};

export const catalogClientKey = (catalogId: string) => `catalog:${catalogId}`;
export const scanClientKey = (scanId: string) => `scan:${scanId}`;

/**
 * Active profile's library, with each scan's cover file rows resolved in the same read, so
 * renderers never query per book or per frame. Never returns another profile's rows.
 */
export async function listLibraryBooks(
	ctx: DataContext,
	profileId: string,
): Promise<LibraryBookView[]> {
	return ctx.database.read(async (db) => {
		const rows = await libraryBookRepository.listActive(db, profileId);
		const files = new Map(
			(await fileRepository.listAll(db, profileId)).map((f) => [f.id, f]),
		);
		const pick = (id: string | null) => (id ? files.get(id) : undefined);
		return rows.map((row) => ({
			...row,
			covers: {
				front: pick(row.coverFrontFileId),
				back: pick(row.coverBackFileId),
				spine: pick(row.coverSpineFileId),
			},
		}));
	});
}

/**
 * Explicitly adds a shared catalog book to this profile's library. Idempotent: adding twice keeps
 * one row (re-adding a removed book restores it). Not marked as read.
 */
export async function addCatalogBook(
	ctx: DataContext,
	profileId: string,
	book: CatalogBookRef,
): Promise<LibraryBook> {
	if (!book.id || !book.title?.trim())
		throw new ValidationError(
			"Catalog book needs an id and title",
			"catalogId",
		);
	const clientKey = catalogClientKey(book.id);
	return ctx.database.write(async (db) => {
		const existing = await libraryBookRepository.getByClientKey(
			db,
			profileId,
			clientKey,
		);
		const now = ctx.clock();
		if (existing) {
			if (!existing.deletedAt) return existing;
			const restored = { deletedAt: null, addedAt: now, updatedAt: now };
			await libraryBookRepository.update(db, profileId, existing.id, restored);
			return { ...existing, ...restored };
		}
		const row: LibraryBook = {
			id: ctx.newId(),
			profileId,
			clientKey,
			source: "catalog",
			catalogId: book.id,
			title: book.title.trim(),
			author: book.author ?? "",
			widthCm: book.size?.width ?? null,
			heightCm: book.size?.height ?? null,
			thicknessCm: book.size?.thickness ?? null,
			color: null,
			coverFrontFileId: null,
			coverBackFileId: null,
			coverSpineFileId: null,
			addedAt: now,
			deletedAt: null,
			createdAt: now,
			updatedAt: now,
		};
		await libraryBookRepository.insertIfAbsent(db, row);
		await recordChange(
			ctx,
			db,
			{
				profileId,
				entity: "library_book",
				entityId: row.id,
				op: "create",
				idempotencyKey: `library_book:${row.id}:create`,
				payload: { catalogId: book.id },
			},
			now,
		);
		return row;
	});
}

/** Soft-removes a book from this profile's library (scan data and files are kept). */
export async function removeLibraryBook(
	ctx: DataContext,
	profileId: string,
	id: string,
) {
	await ctx.database.write(async (db) => {
		const row = await libraryBookRepository.get(db, profileId, id);
		if (!row) throw new NotFoundError("Library book");
		if (row.deletedAt) return;
		const now = Math.max(ctx.clock(), row.updatedAt + 1);
		await libraryBookRepository.update(db, profileId, id, {
			deletedAt: now,
			updatedAt: now,
		});
		await recordChange(
			ctx,
			db,
			{
				profileId,
				entity: "library_book",
				entityId: id,
				op: "delete",
				idempotencyKey: `library_book:${id}:delete`,
				payload: { deletedAt: now },
			},
			now,
		);
	});
}
