import { libraryBookRepository } from "../repositories/libraryBooks";
import type { LibraryBook } from "../schema";
import { type DataContext, NotFoundError, ValidationError } from "./context";
import { NEW_BOOK_FIELDS } from "./libraryBooks";

export type MetadataPatch = {
	title?: string;
	author?: string;
	subtitle?: string | null;
	isbn?: string | null;
	edition?: string | null;
	publisher?: string | null;
	expectedPageCount?: number | null;
};

function optional(value: string | null | undefined, field: string, max = 200) {
	if (value === undefined) return undefined;
	const v = value?.trim() ?? "";
	if (v.length > max) throw new ValidationError(`${field} is too long`, field);
	return v || null;
}

/**
 * Edits THIS person's library entry only (never the bundled catalog or a canonical record).
 * Bumps `metadataRevision` when anything changes, so a future sync sees it as changed.
 */
export async function updateBookMetadata(
	ctx: DataContext,
	profileId: string,
	bookId: string,
	patch: MetadataPatch,
): Promise<LibraryBook> {
	const next: Partial<LibraryBook> = {};
	if (patch.title !== undefined) {
		const title = patch.title.trim();
		if (!title) throw new ValidationError("Title is required", "title");
		if (title.length > 300)
			throw new ValidationError("Title is too long", "title");
		next.title = title;
	}
	if (patch.author !== undefined)
		next.author = optional(patch.author, "author") ?? "";
	for (const key of ["subtitle", "edition", "publisher"] as const) {
		const v = optional(patch[key], key);
		if (v !== undefined) next[key] = v;
	}
	if (patch.isbn !== undefined) {
		const isbn = optional(patch.isbn, "isbn", 40);
		if (isbn && !/^[0-9Xx\- ]{10,20}$/.test(isbn))
			throw new ValidationError(
				"ISBN may contain only digits, X, spaces and hyphens",
				"isbn",
			);
		next.isbn = isbn;
	}
	if (patch.expectedPageCount !== undefined) {
		const n = patch.expectedPageCount;
		if (n !== null && (!Number.isInteger(n) || n < 1 || n > 20_000))
			throw new ValidationError(
				"Page count must be a whole number from 1 to 20000",
				"expectedPageCount",
			);
		next.expectedPageCount = n;
	}
	return ctx.database.write(async (db) => {
		const book = await libraryBookRepository.get(db, profileId, bookId);
		if (!book || book.deletedAt) throw new NotFoundError("Book");
		const changed = Object.entries(next).some(
			([k, v]) => (book as Record<string, unknown>)[k] !== v,
		);
		if (!changed) return book;
		const updated = {
			...next,
			metadataRevision: book.metadataRevision + 1,
			updatedAt: Math.max(ctx.clock(), book.updatedAt + 1),
		};
		await libraryBookRepository.update(db, profileId, bookId, updated);
		return { ...book, ...updated };
	});
}

/** Adds a book by hand (no network, no scanner). `manual:<key>` keeps a retry to one row. */
export async function addManualBook(
	ctx: DataContext,
	profileId: string,
	input: { title: string; author?: string; clientKey?: string },
): Promise<LibraryBook> {
	const title = input.title.trim();
	if (!title) throw new ValidationError("Title is required", "title");
	if (title.length > 300)
		throw new ValidationError("Title is too long", "title");
	const clientKey = `manual:${input.clientKey ?? ctx.newId()}`;
	return ctx.database.write(async (db) => {
		const existing = await libraryBookRepository.getByClientKey(
			db,
			profileId,
			clientKey,
		);
		if (existing) return existing;
		const now = ctx.clock();
		const row: LibraryBook = {
			...NEW_BOOK_FIELDS,
			id: ctx.newId(),
			profileId,
			clientKey,
			source: "manual",
			catalogId: null,
			title,
			author: input.author?.trim() ?? "",
			widthCm: null,
			heightCm: null,
			thicknessCm: null,
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
		return row;
	});
}
