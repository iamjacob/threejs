import { sha256Hex } from "../ids";
import { fileRepository } from "../repositories/files";
import { libraryBookRepository } from "../repositories/libraryBooks";
import type { DataContext } from "./context";
import { scanClientKey } from "./libraryBooks";

/** The part of a legacy IndexedDB `boooks-scans` record the import reads (see scannedBook.ts). */
export type LegacyScanRecord = {
	id: string;
	title?: string;
	author?: string;
	cover?: { front?: string; back?: string; spine?: string };
	/** World units (1 = 30 cm), like LibraryBook.dimensions in the scanner. */
	dimensions?: [number, number, number];
	enrichment?: {
		physicalSize?: {
			widthCm?: number;
			heightCm?: number;
			thicknessCm?: number;
		};
	};
};

/** Port over the legacy store. The import never deletes records. */
export interface LegacyScanSource {
	list(): Promise<LegacyScanRecord[]>;
	/** Ids already imported and verified (marker store). */
	importedIds(): Promise<Set<string>>;
	markImported(id: string, profileId: string): Promise<void>;
}

export const COVER_FACES = ["front", "back", "spine"] as const;
export type CoverFace = (typeof COVER_FACES)[number];
const CM_PER_WORLD_UNIT = 30;

/** Decodes a `data:image/*;base64,…` URL. Anything else (http URLs, paths) → undefined; never fetches. */
export function decodeImageDataUrl(
	url: unknown,
): { bytes: Uint8Array; mimeType: string } | undefined {
	if (typeof url !== "string") return undefined;
	const match =
		/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(url);
	if (!match) return undefined;
	try {
		const binary = atob(match[2]);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes.length ? { bytes, mimeType: match[1] } : undefined;
	} catch {
		return undefined;
	}
}

/** Physical size in cm: enrichment first, then world-unit dimensions; undefined if unknown. */
export function physicalCm(
	record: LegacyScanRecord,
): [number, number, number] | undefined {
	const p = record.enrichment?.physicalSize;
	const cm = [p?.widthCm, p?.heightCm, p?.thicknessCm];
	if (cm.every((v) => typeof v === "number" && v > 0))
		return cm as [number, number, number];
	const d = record.dimensions;
	if (d?.length === 3 && d.every((v) => Number.isFinite(v) && v > 0))
		return d.map((v) => v * CM_PER_WORLD_UNIT) as [number, number, number];
	return undefined;
}

/** Book row exists and every referenced cover has bytes in the FileStore with a matching hash. */
export async function verifyImportedScan(
	ctx: DataContext,
	profileId: string,
	scanId: string,
) {
	const { book, files } = await ctx.database.read(async (db) => {
		const book = await libraryBookRepository.getByClientKey(
			db,
			profileId,
			scanClientKey(scanId),
		);
		const ids = [
			book?.coverFrontFileId,
			book?.coverBackFileId,
			book?.coverSpineFileId,
		].filter((id): id is string => !!id);
		const files = await Promise.all(
			ids.map((id) => fileRepository.get(db, profileId, id)),
		);
		return { book, files };
	});
	if (!book) throw new Error("verification: book row missing");
	if (!book.coverFrontFileId) throw new Error("verification: no front cover");
	for (const file of files) {
		if (!file) throw new Error("verification: cover file row missing");
		const bytes = await ctx.files.get(file.blobKey);
		if (!bytes || (await sha256Hex(bytes)) !== file.blobKey)
			throw new Error("verification: cover bytes missing or corrupt");
	}
}
