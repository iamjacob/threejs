import {
	bookAssetRepository,
	syncStateRepository,
} from "../repositories/bookAssets";
import { fileRepository } from "../repositories/files";
import { libraryBookRepository } from "../repositories/libraryBooks";
import type { BookAsset, FileRecord, LibraryBook } from "../schema";
import { type PageNumberIssues, pageNumberIssues } from "./bookPages";
import {
	type AssetView,
	type BookStatus,
	deriveBookStatus,
} from "./bookStatus";
import { type DataContext, NotFoundError } from "./context";

/**
 * Book Overview / Data Manager reads. Every call takes the active profile id explicitly and every
 * query filters on it. Edits are in bookMetadata.ts, intake in bookIntake.ts. No outbox rows are
 * written by this slice: nothing can be sent yet (no backend), and a future sync derives its work
 * from `sync_states` vs current revisions and hashes.
 */
/** No sync target is configured in this build. A real backend stage flips this per target. */
export const SYNC_CONFIGURED = false;

export type CoverView = {
	face: "front" | "back" | "spine";
	source: "file" | "catalog_bundle";
	file?: FileRecord;
	bytesOk: boolean;
};

export type BookOverview = {
	book: LibraryBook;
	covers: CoverView[];
	pages: (BookAsset & { bytesOk: boolean })[];
	/** Imported EPUB/PDF files (0005). Not page scans: they never make page content "complete". */
	digitalFiles: (BookAsset & { bytesOk: boolean })[];
	pageIssues: PageNumberIssues;
	failed: BookAsset[];
	status: BookStatus;
};

const FACES = ["front", "back", "spine"] as const;

export function listMyBooks(ctx: DataContext, profileId: string) {
	return ctx.database.read((db) =>
		libraryBookRepository.listActive(db, profileId),
	);
}

export async function getBookOverview(
	ctx: DataContext,
	profileId: string,
	bookId: string,
): Promise<BookOverview> {
	const { book, assets, coverFiles, acks } = await ctx.database.read(
		async (db) => {
			const book = await libraryBookRepository.get(db, profileId, bookId);
			if (!book || book.deletedAt) throw new NotFoundError("Book");
			const assets = await bookAssetRepository.listForBook(
				db,
				profileId,
				bookId,
			);
			const ids = [
				book.coverFrontFileId,
				book.coverBackFileId,
				book.coverSpineFileId,
			];
			const coverFiles = await Promise.all(
				ids.map((id) =>
					id ? fileRepository.get(db, profileId, id) : undefined,
				),
			);
			const acks = (await syncStateRepository.list(db, profileId)).filter(
				(s) => s.entityId === bookId || assets.some((a) => a.id === s.entityId),
			);
			return { book, assets, coverFiles, acks };
		},
	);
	// Presence of each blob (hashes were verified at intake). Missing bytes → needs attention.
	const present = (key?: string) =>
		key ? ctx.files.has(key) : Promise.resolve(false);
	const covers: CoverView[] = [];
	for (const [i, face] of FACES.entries()) {
		const file = coverFiles[i];
		if (file)
			covers.push({
				face,
				source: "file",
				file,
				bytesOk: await present(file.blobKey),
			});
		else if (book.source === "catalog" && face === "front")
			covers.push({ face, source: "catalog_bundle", bytesOk: true });
	}
	const pages = (
		await Promise.all(
			assets
				.filter((a) => a.kind === "page_scan" && a.intake === "saved")
				.map(async (a) => ({ ...a, bytesOk: await present(a.sha256) })),
		)
	).sort(
		(a, b) =>
			(a.pageIndex ?? 0) - (b.pageIndex ?? 0) ||
			a.createdAt - b.createdAt ||
			a.id.localeCompare(b.id),
	);
	const digitalFiles = await Promise.all(
		assets
			.filter((a) => a.kind === "digital_file" && a.intake === "saved")
			.map(async (a) => ({ ...a, bytesOk: await present(a.sha256) })),
	);
	const failed = assets.filter((a) => a.intake === "failed");
	const views: AssetView[] = [
		...covers.map((c) => ({
			id: `cover:${c.face}`,
			kind: "cover" as const,
			pageIndex: null,
			sha256: c.file?.blobKey ?? "",
			intake: "saved" as const,
			bytesOk: c.bytesOk,
		})),
		...pages,
		...digitalFiles,
		...failed.map((f) => ({ ...f, bytesOk: false })),
	];
	const status = deriveBookStatus({
		bookId,
		title: book.title,
		metadataRevision: book.metadataRevision,
		expectedPageCount: book.expectedPageCount,
		catalogMatch: book.catalogMatch,
		assets: views,
		acks,
		syncConfigured: SYNC_CONFIGURED,
	});
	return {
		book,
		covers,
		pages,
		digitalFiles,
		pageIssues: pageNumberIssues(pages, book.expectedPageCount),
		failed,
		status,
	};
}

/** Bytes of a page or cover for preview, only if the file row belongs to this profile. */
export async function readAssetBytes(
	ctx: DataContext,
	profileId: string,
	fileId: string,
): Promise<{ bytes?: Uint8Array; mimeType: string }> {
	const file = await ctx.database.read((db) =>
		fileRepository.get(db, profileId, fileId),
	);
	if (!file) throw new NotFoundError("File");
	return { bytes: await ctx.files.get(file.blobKey), mimeType: file.mimeType };
}
