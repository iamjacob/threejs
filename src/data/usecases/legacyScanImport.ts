import { sha256Hex } from "../ids";
import { fileRepository } from "../repositories/files";
import { libraryBookRepository } from "../repositories/libraryBooks";
import { profileRepository } from "../repositories/profiles";
import type { FileRecord, LibraryBook } from "../schema";
import type { DataContext } from "./context";
import {
	COVER_FACES,
	type CoverFace,
	decodeImageDataUrl,
	type LegacyScanRecord,
	type LegacyScanSource,
	physicalCm,
	verifyImportedScan,
} from "./legacyScanRecord";
import { scanClientKey } from "./libraryBooks";

export type {
	LegacyScanRecord,
	LegacyScanSource,
} from "./legacyScanRecord";
export { decodeImageDataUrl } from "./legacyScanRecord";

export type LegacyImportReport = {
	status: "imported" | "skipped_not_guest" | "nothing_to_do";
	profileId?: string;
	imported: string[];
	alreadyImported: string[];
	failed: { id: string; reason: string }[];
};

/**
 * Imports device-wide legacy scans into the persistent GUEST profile only (they predate accounts).
 * Per scan: cover bytes → FileStore (content-addressed, idempotent), then ONE SQLite transaction for
 * the file rows + book row (deterministic ids), then read-back verification, then the legacy record
 * is marked imported. Original records are kept. Safe to re-run after a crash at any point.
 */
export async function importLegacyScans(
	ctx: DataContext,
	activeProfileId: string,
	source: LegacyScanSource,
): Promise<LegacyImportReport> {
	const report: LegacyImportReport = {
		status: "nothing_to_do",
		imported: [],
		alreadyImported: [],
		failed: [],
	};
	const profile = await ctx.database.read((db) =>
		profileRepository.get(db, activeProfileId),
	);
	if (!profile || profile.kind !== "guest" || profile.mergedInto) {
		report.status = "skipped_not_guest";
		return report;
	}
	report.profileId = profile.id;
	const [records, done] = await Promise.all([
		source.list(),
		source.importedIds(),
	]);
	for (const record of records) {
		const id = typeof record?.id === "string" ? record.id : "";
		if (!id) {
			report.failed.push({ id: String(record?.id), reason: "missing id" });
			continue;
		}
		if (done.has(id)) {
			report.alreadyImported.push(id);
			continue;
		}
		try {
			await importOne(ctx, profile.id, record);
			await verifyImportedScan(ctx, profile.id, id);
			await source.markImported(id, profile.id);
			report.imported.push(id);
		} catch (error) {
			report.failed.push({
				id,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
	if (report.imported.length || report.failed.length)
		report.status = "imported";
	return report;
}

async function importOne(
	ctx: DataContext,
	profileId: string,
	record: LegacyScanRecord,
) {
	const title = record.title?.trim();
	if (!title) throw new Error("missing title");
	const decoded = new Map<
		CoverFace,
		{ bytes: Uint8Array; mimeType: string; key: string }
	>();
	for (const face of COVER_FACES) {
		const data = decodeImageDataUrl(record.cover?.[face]);
		if (!data) continue;
		const key = await sha256Hex(data.bytes);
		// Bytes before the DB commit: an orphan blob is harmless and reused on retry.
		await ctx.files.put(key, data.bytes);
		decoded.set(face, { ...data, key });
	}
	if (!decoded.has("front"))
		throw new Error("front cover is not an embedded image");

	await ctx.database.write(async (db) => {
		const clientKey = scanClientKey(record.id);
		if (await libraryBookRepository.getByClientKey(db, profileId, clientKey))
			return;
		const now = ctx.clock();
		const fileIds: Partial<Record<CoverFace, string>> = {};
		for (const [face, data] of decoded) {
			const file: FileRecord = {
				id: `${profileId}:${clientKey}:${face}`,
				profileId,
				blobKey: data.key,
				mimeType: data.mimeType,
				byteSize: data.bytes.byteLength,
				width: null,
				height: null,
				createdAt: now,
				updatedAt: now,
			};
			await fileRepository.insertIfAbsent(db, file);
			fileIds[face] = file.id;
		}
		const cm = physicalCm(record);
		const book: LibraryBook = {
			id: `${profileId}:${clientKey}`,
			profileId,
			clientKey,
			source: "scan",
			catalogId: null,
			title,
			author: record.author?.trim() ?? "",
			widthCm: cm?.[0] ?? null,
			heightCm: cm?.[1] ?? null,
			thicknessCm: cm?.[2] ?? null,
			color: null,
			coverFrontFileId: fileIds.front ?? null,
			coverBackFileId: fileIds.back ?? null,
			coverSpineFileId: fileIds.spine ?? null,
			addedAt: now,
			deletedAt: null,
			createdAt: now,
			updatedAt: now,
		};
		await libraryBookRepository.insertIfAbsent(db, book);
	});
}
