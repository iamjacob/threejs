import { sha256Hex } from "../ids";
import { bookAssetRepository } from "../repositories/bookAssets";
import { fileRepository } from "../repositories/files";
import { libraryBookRepository } from "../repositories/libraryBooks";
import type { BookAsset } from "../schema";
import { type DataContext, NotFoundError, ValidationError } from "./context";

export const PAGE_IMAGE_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
]);
export const PAGE_MAX_BYTES = 15 * 1024 * 1024;

export class IntegrityError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "IntegrityError";
	}
}

export type PageInput = {
	bytes: Uint8Array;
	mimeType: string;
	provenance: "camera" | "device_file";
	originalName?: string;
	/** Explicit page position; default = the first page index without a scan. */
	pageIndex?: number;
};

const pageAssetId = (profileId: string, bookId: string, sha: string) =>
	`${profileId}:${bookId}:page_scan:${sha}`;

/**
 * One page image → FileStore (content-addressed) → re-read + hash check → ONE transaction with the
 * file row and the manifest row. Idempotent per (book, bytes): a retry or a duplicate pick keeps
 * one page. If storing/verifying fails, a 'failed' row records the reason (visible after restart)
 * and the error is rethrown; retrying the same image turns that row into 'saved'.
 */
export async function addPageScan(
	ctx: DataContext,
	profileId: string,
	bookId: string,
	input: PageInput,
): Promise<BookAsset> {
	if (!PAGE_IMAGE_TYPES.has(input.mimeType))
		throw new ValidationError(
			`${input.mimeType || "This file type"} is not supported for page scans. Use JPEG, PNG or WebP.`,
			"file",
		);
	if (input.bytes.byteLength === 0 || input.bytes.byteLength > PAGE_MAX_BYTES)
		throw new ValidationError(
			"A page image must be between 1 byte and 15 MB",
			"file",
		);
	const sha = await sha256Hex(input.bytes);
	const book = await ctx.database.read((db) =>
		libraryBookRepository.get(db, profileId, bookId),
	);
	if (!book || book.deletedAt) throw new NotFoundError("Book");
	const failure = {
		id: pageAssetId(profileId, bookId, sha),
		profileId,
		bookId,
		kind: "page_scan" as const,
		role: null,
		sha256: sha,
		mimeType: input.mimeType,
		byteSize: input.bytes.byteLength,
		originalName: input.originalName?.slice(0, 200) ?? null,
		provenance: input.provenance,
	};
	try {
		await storeVerified(
			ctx,
			sha,
			input.bytes,
			"The saved image did not match what was picked",
		);
	} catch (error) {
		await recordIntakeFailure(ctx, failure, error);
		throw error;
	}
	return ctx.database.write(async (db) => {
		// Re-checked inside the commit: a storage cleanup (which runs in this same write queue) may
		// have freed these bytes between the check above and now.
		await ensureStoredInCommit(ctx, sha, input.bytes);
		const now = ctx.clock();
		const id = pageAssetId(profileId, bookId, sha);
		const fileId = `${id}:file`;
		await fileRepository.insertIfAbsent(db, {
			id: fileId,
			profileId,
			blobKey: sha,
			mimeType: input.mimeType,
			byteSize: input.bytes.byteLength,
			width: null,
			height: null,
			createdAt: now,
			updatedAt: now,
		});
		const existing = await bookAssetRepository.get(db, profileId, id);
		if (existing?.intake === "saved" && !existing.removedAt) return existing;
		const live = await bookAssetRepository.listForBook(db, profileId, bookId);
		const used = new Set(
			live
				.filter(
					(a) => a.kind === "page_scan" && a.intake === "saved" && a.id !== id,
				)
				.map((a) => a.pageIndex),
		);
		let pageIndex = input.pageIndex ?? 0;
		if (input.pageIndex === undefined) while (used.has(pageIndex)) pageIndex++;
		else if (used.has(pageIndex))
			throw new ValidationError(
				`Page ${pageIndex + 1} already has a scan. Remove it first.`,
				"pageIndex",
			);
		const saved = {
			intake: "saved" as const,
			lastError: null,
			removedAt: null,
			pageIndex,
			fileId,
			updatedAt: now,
		};
		if (existing) {
			// A failed or removed row for the same bytes is completed/restored, never duplicated.
			await bookAssetRepository.update(db, profileId, id, saved);
			return { ...existing, ...saved };
		}
		const row: BookAsset = {
			id,
			profileId,
			bookId,
			kind: "page_scan",
			role: null,
			sha256: sha,
			mimeType: input.mimeType,
			byteSize: input.bytes.byteLength,
			originalName: input.originalName?.slice(0, 200) ?? null,
			provenance: input.provenance,
			rightsNote: null,
			rightsBasis: null,
			sourceNote: null,
			createdAt: now,
			...saved,
		};
		await bookAssetRepository.insertIfAbsent(db, row);
		return row;
	});
}

/**
 * Bytes → FileStore (content-addressed, idempotent) → re-read → sha256 must match. The original
 * bytes are stored exactly as given (never re-encoded).
 */
export async function storeVerified(
	ctx: DataContext,
	sha: string,
	bytes: Uint8Array,
	mismatch: string,
) {
	await ctx.files.put(sha, bytes);
	const stored = await ctx.files.get(sha);
	if (!stored || (await sha256Hex(stored)) !== sha)
		throw new IntegrityError(mismatch);
}

/** Inside a write: if the bytes vanished (freed by a cleanup), store them again before committing. */
export async function ensureStoredInCommit(
	ctx: DataContext,
	sha: string,
	bytes: Uint8Array,
) {
	if (await ctx.files.has(sha)) return;
	await storeVerified(
		ctx,
		sha,
		bytes,
		"The saved file did not match what was picked",
	);
}

export type IntakeFailure = Pick<
	BookAsset,
	| "id"
	| "profileId"
	| "bookId"
	| "kind"
	| "role"
	| "sha256"
	| "mimeType"
	| "byteSize"
	| "originalName"
	| "provenance"
> &
	Partial<Pick<BookAsset, "rightsBasis" | "sourceNote" | "rightsNote">>;

/**
 * Records a failed intake with its reason (visible after restart). Never downgrades a saved row.
 * Best effort: if even this write fails, the original error is what the caller reports.
 */
export async function recordIntakeFailure(
	ctx: DataContext,
	row: IntakeFailure,
	error: unknown,
) {
	const lastError = error instanceof Error ? error.message : String(error);
	await ctx.database
		.write(async (db) => {
			const now = ctx.clock();
			const existing = await bookAssetRepository.get(db, row.profileId, row.id);
			if (existing?.intake === "saved" && !existing.removedAt) return;
			if (existing) {
				await bookAssetRepository.update(db, row.profileId, row.id, {
					intake: "failed",
					lastError,
					removedAt: null,
					updatedAt: now,
				});
				return;
			}
			await bookAssetRepository.insertIfAbsent(db, {
				rightsNote: null,
				rightsBasis: null,
				sourceNote: null,
				...row,
				pageIndex: null,
				fileId: null,
				intake: "failed",
				lastError,
				removedAt: null,
				createdAt: now,
				updatedAt: now,
			});
		})
		.catch(() => {});
}

/**
 * Removes a page, file or failed import from the book (soft). The bytes stay in this device's
 * storage, so removal never destroys the only copy; re-adding the same bytes restores it. Space
 * is freed only by the explicit, confirmed cleanup in storageCleanup.ts.
 */
export async function removeAsset(
	ctx: DataContext,
	profileId: string,
	id: string,
) {
	await ctx.database.write(async (db) => {
		const asset = await bookAssetRepository.get(db, profileId, id);
		if (!asset || asset.removedAt) throw new NotFoundError("Page");
		const now = Math.max(ctx.clock(), asset.updatedAt + 1);
		await bookAssetRepository.update(db, profileId, id, {
			removedAt: now,
			updatedAt: now,
		});
	});
}
