import type { Db } from "../db/database";
import { bookAssetRepository } from "../repositories/bookAssets";
import { libraryBookRepository } from "../repositories/libraryBooks";
import type { BookAsset } from "../schema";
import { type DataContext, NotFoundError, ValidationError } from "./context";

/**
 * Page numbering and order for one book of the active profile. `page_index` is 0-based in SQLite
 * and shown 1-based. Every change runs in one transaction, bumps the book's `metadataRevision`
 * (page order is part of the book's record, so a future sync must see it as changed), and is
 * scoped to `profileId`.
 */
export const MAX_PAGE_NUMBER = 20_000;

export class PageConflictError extends ValidationError {
	constructor(
		readonly pageNumber: number,
		readonly occupiedBy: string,
	) {
		super(
			`Page ${pageNumber} already has a scan. Swap the two pages, or choose another number.`,
			"pageIndex",
		);
		this.name = "PageConflictError";
	}
}

export type PageNumberIssues = {
	/** 1-based numbers that more than one saved scan claims (e.g. from an older import). */
	duplicates: number[];
	/** 1-based numbers with no scan, up to the expected count or the highest page, whichever is larger. */
	missing: number[];
};

/** Pure: duplicate and missing page numbers among saved, live page scans. */
export function pageNumberIssues(
	pages: readonly Pick<BookAsset, "pageIndex">[],
	expectedPageCount: number | null,
): PageNumberIssues {
	const counts = new Map<number, number>();
	for (const p of pages)
		if (p.pageIndex !== null)
			counts.set(p.pageIndex, (counts.get(p.pageIndex) ?? 0) + 1);
	const duplicates = [...counts]
		.filter(([, n]) => n > 1)
		.map(([i]) => i + 1)
		.sort((a, b) => a - b);
	const highest = counts.size ? Math.max(...counts.keys()) + 1 : 0;
	// Up to the expected count AND the highest numbered page: a gap below any scan is always missing.
	const upTo = Math.max(
		expectedPageCount && expectedPageCount > 0 ? expectedPageCount : 0,
		highest,
	);
	const missing: number[] = [];
	for (let i = 0; i < upTo; i++) if (!counts.has(i)) missing.push(i + 1);
	return { duplicates, missing };
}

async function livePages(db: Db, profileId: string, bookId: string) {
	return (await bookAssetRepository.listForBook(db, profileId, bookId))
		.filter((a) => a.kind === "page_scan" && a.intake === "saved")
		.sort(
			(a, b) =>
				(a.pageIndex ?? 0) - (b.pageIndex ?? 0) ||
				a.createdAt - b.createdAt ||
				a.id.localeCompare(b.id),
		);
}

async function loadPage(db: Db, profileId: string, assetId: string) {
	const asset = await bookAssetRepository.get(db, profileId, assetId);
	if (
		!asset ||
		asset.removedAt ||
		asset.kind !== "page_scan" ||
		asset.intake !== "saved"
	)
		throw new NotFoundError("Page");
	const book = await libraryBookRepository.get(db, profileId, asset.bookId);
	if (!book || book.deletedAt) throw new NotFoundError("Book");
	return { asset, book };
}

async function commit(
	ctx: DataContext,
	db: Db,
	profileId: string,
	book: { id: string; metadataRevision: number; updatedAt: number },
	changes: { id: string; pageIndex: number }[],
) {
	const now = Math.max(ctx.clock(), book.updatedAt + 1);
	for (const c of changes)
		await bookAssetRepository.update(db, profileId, c.id, {
			pageIndex: c.pageIndex,
			updatedAt: now,
		});
	if (changes.length)
		await libraryBookRepository.update(db, profileId, book.id, {
			metadataRevision: book.metadataRevision + 1,
			updatedAt: now,
		});
}

/**
 * Gives a page an explicit 1-based number. If another scan already has that number the change is
 * refused with PageConflictError, unless `swap` is set, in which case the two pages trade numbers.
 * Setting the number a page already has changes nothing (no revision bump).
 */
export async function setPageNumber(
	ctx: DataContext,
	profileId: string,
	assetId: string,
	pageNumber: number,
	options: { swap?: boolean } = {},
): Promise<void> {
	if (
		!Number.isInteger(pageNumber) ||
		pageNumber < 1 ||
		pageNumber > MAX_PAGE_NUMBER
	)
		throw new ValidationError(
			`Page number must be a whole number from 1 to ${MAX_PAGE_NUMBER}`,
			"pageIndex",
		);
	const target = pageNumber - 1;
	await ctx.database.write(async (db) => {
		const { asset, book } = await loadPage(db, profileId, assetId);
		if (asset.pageIndex === target) return;
		const others = (await livePages(db, profileId, book.id)).filter(
			(p) => p.pageIndex === target && p.id !== asset.id,
		);
		if (others.length && !options.swap)
			throw new PageConflictError(pageNumber, others[0].id);
		if (others.length > 1)
			throw new ValidationError(
				`Page ${pageNumber} has more than one scan. Renumber those first.`,
				"pageIndex",
			);
		const changes = [{ id: asset.id, pageIndex: target }];
		if (others.length && asset.pageIndex !== null)
			changes.push({ id: others[0].id, pageIndex: asset.pageIndex });
		await commit(ctx, db, profileId, book, changes);
	});
}

/**
 * Moves a page one place earlier (-1) or later (+1) in reading order by trading numbers with its
 * neighbour. Gaps stay where they are. The first page cannot move earlier, nor the last later.
 */
export async function movePage(
	ctx: DataContext,
	profileId: string,
	assetId: string,
	direction: -1 | 1,
): Promise<void> {
	await ctx.database.write(async (db) => {
		const { asset, book } = await loadPage(db, profileId, assetId);
		const pages = await livePages(db, profileId, book.id);
		const at = pages.findIndex((p) => p.id === asset.id);
		const neighbour = pages[at + direction];
		const mine = asset.pageIndex ?? 0;
		const duplicated = pages.some(
			(p) => p.id !== asset.id && p.pageIndex === asset.pageIndex,
		);
		if (duplicated) {
			// A shared number: move this scan to the next number instead of swapping (a swap would
			// only hand the duplicate to another page).
			const next = mine + direction;
			if (next < 0 || next >= MAX_PAGE_NUMBER)
				throw new ValidationError(
					"No page number left in that direction",
					"pageIndex",
				);
			if (pages.some((p) => p.pageIndex === next))
				throw new PageConflictError(
					next + 1,
					pages.find((p) => p.pageIndex === next)?.id ?? "",
				);
			await commit(ctx, db, profileId, book, [
				{ id: asset.id, pageIndex: next },
			]);
			return;
		}
		if (!neighbour)
			throw new ValidationError(
				direction < 0
					? "This is already the first page"
					: "This is already the last page",
				"pageIndex",
			);
		const theirs = neighbour.pageIndex ?? 0;
		await commit(ctx, db, profileId, book, [
			{ id: asset.id, pageIndex: theirs },
			{ id: neighbour.id, pageIndex: mine },
		]);
	});
}
