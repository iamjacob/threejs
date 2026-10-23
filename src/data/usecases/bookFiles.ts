import { sha256Hex } from "../ids";
import { bookAssetRepository } from "../repositories/bookAssets";
import { fileRepository } from "../repositories/files";
import { libraryBookRepository } from "../repositories/libraryBooks";
import type { BookAsset } from "../schema";
import {
	ensureStoredInCommit,
	recordIntakeFailure,
	storeVerified,
} from "./bookIntake";
import { type DataContext, NotFoundError, ValidationError } from "./context";

/**
 * Digital book files (EPUB, PDF) attached to one library book of the active profile. Local only:
 * the original bytes go to this device's FileStore exactly as picked (never re-encoded) and SQLite
 * stores the manifest row (`book_assets.kind = 'digital_file'`). Nothing is uploaded or published.
 */
export const DIGITAL_FORMATS = {
	epub: "application/epub+zip",
	pdf: "application/pdf",
} as const;
export type DigitalFormat = keyof typeof DIGITAL_FORMATS;

/**
 * 20 MB. Native file storage moves bytes over the Capacitor bridge as base64 (about 27 MB of
 * string for 20 MB), so the limit is kept well below what a WebView handles comfortably.
 */
export const DIGITAL_MAX_BYTES = 20 * 1024 * 1024;

/** What the person states about their right to keep this file. Recorded, not verified. */
export const DIGITAL_RIGHTS_BASES = [
	"public_domain",
	"open_license",
	"purchased_drm_free",
	"own_work",
	"other",
] as const;
export type DigitalRightsBasis = (typeof DIGITAL_RIGHTS_BASES)[number];

export type DigitalFileInput = {
	bytes: Uint8Array;
	/** As reported by the picker. Only a hint: the format is detected from the bytes. */
	mimeType?: string;
	originalName?: string;
	rightsBasis: DigitalRightsBasis;
	/** Free text, e.g. "Project Gutenberg" or "Bought from the publisher". Required for 'other'. */
	sourceNote?: string;
	rightsNote?: string;
};

const ascii = (bytes: Uint8Array, start: number, length: number) =>
	String.fromCharCode(...bytes.subarray(start, start + length));

function lastIndexOf(bytes: Uint8Array, needle: number[], window: number) {
	const from = Math.max(0, bytes.length - window);
	outer: for (let i = bytes.length - needle.length; i >= from; i--) {
		for (let j = 0; j < needle.length; j++)
			if (bytes[i + j] !== needle[j]) continue outer;
		return i;
	}
	return -1;
}

export type FormatCheck =
	| { ok: true; format: DigitalFormat }
	| { ok: false; reason: string };

/**
 * Detects EPUB or PDF from the bytes alone.
 * - EPUB (OCF 3): a ZIP whose FIRST entry is an uncompressed file named `mimetype` containing
 *   exactly `application/epub+zip`, plus a ZIP end-of-central-directory record (else truncated).
 * - PDF: `%PDF-` within the first 1024 bytes and `%%EOF` within the last 1024 bytes (else
 *   truncated or not a PDF).
 * It does not check that the book opens (DRM, damaged chapters); that needs a reader.
 */
export function detectDigitalFormat(bytes: Uint8Array): FormatCheck {
	if (bytes.length >= 4 && ascii(bytes, 0, 4) === "PK\u0003\u0004") {
		const nameLength = bytes[26] | (bytes[27] << 8);
		const extraLength = bytes[28] | (bytes[29] << 8);
		const method = bytes[8] | (bytes[9] << 8);
		const name = ascii(bytes, 30, nameLength);
		const body = ascii(bytes, 30 + nameLength + extraLength, 20);
		if (name !== "mimetype" || method !== 0 || body !== DIGITAL_FORMATS.epub)
			return {
				ok: false,
				reason:
					"This ZIP file is not an EPUB (its first entry must be an uncompressed 'mimetype' of application/epub+zip).",
			};
		// EOCD is 22 bytes plus an optional comment of up to 65535 bytes.
		if (lastIndexOf(bytes, [0x50, 0x4b, 0x05, 0x06], 22 + 65535) < 0)
			return {
				ok: false,
				reason:
					"This EPUB looks incomplete (the end of the ZIP is missing). Download it again.",
			};
		return { ok: true, format: "epub" };
	}
	const head = ascii(bytes, 0, Math.min(1024, bytes.length));
	if (head.includes("%PDF-")) {
		if (lastIndexOf(bytes, [0x25, 0x25, 0x45, 0x4f, 0x46], 1024) < 0)
			return {
				ok: false,
				reason:
					"This PDF looks incomplete (no end-of-file marker). Download it again.",
			};
		return { ok: true, format: "pdf" };
	}
	return {
		ok: false,
		reason:
			"This file is not an EPUB or a PDF. Only EPUB and PDF can be imported.",
	};
}

const text = (v: string | undefined, field: string, max: number) => {
	const t = v?.trim() ?? "";
	if (t.length > max) throw new ValidationError(`${field} is too long`, field);
	return t || null;
};

export const digitalAssetId = (
	profileId: string,
	bookId: string,
	sha: string,
) => `${profileId}:${bookId}:digital_file:${sha}`;

/**
 * Imports one EPUB/PDF into a library book. Order: validate (format from bytes, size, rights) →
 * FileStore put → re-read + sha256 → ONE transaction with the `files` row and the manifest row.
 * Idempotent per (book, bytes): a retry, a double tap or the same file picked again keeps one row.
 * A failed store leaves a 'failed' row with the reason; importing the same file again completes it.
 * A removed file is restored by importing the same bytes. Validation failures write nothing.
 */
export async function importDigitalFile(
	ctx: DataContext,
	profileId: string,
	bookId: string,
	input: DigitalFileInput,
): Promise<BookAsset> {
	const size = input.bytes.byteLength;
	if (size === 0) throw new ValidationError("The file is empty", "file");
	if (size > DIGITAL_MAX_BYTES)
		throw new ValidationError(
			`The file is ${(size / 1048576).toFixed(1)} MB. EPUB and PDF files can be up to 20 MB.`,
			"file",
		);
	const check = detectDigitalFormat(input.bytes);
	if (!check.ok) throw new ValidationError(check.reason, "file");
	if (!DIGITAL_RIGHTS_BASES.includes(input.rightsBasis))
		throw new ValidationError(
			"Choose why you may keep this file on this device",
			"rightsBasis",
		);
	const sourceNote = text(input.sourceNote, "sourceNote", 200);
	const rightsNote = text(input.rightsNote, "rightsNote", 500);
	if (input.rightsBasis === "other" && !sourceNote && !rightsNote)
		throw new ValidationError(
			"Describe where the file came from when choosing 'Other'",
			"sourceNote",
		);
	const sha = await sha256Hex(input.bytes);
	const book = await ctx.database.read((db) =>
		libraryBookRepository.get(db, profileId, bookId),
	);
	if (!book || book.deletedAt) throw new NotFoundError("Book");
	const id = digitalAssetId(profileId, bookId, sha);
	const meta = {
		id,
		profileId,
		bookId,
		kind: "digital_file" as const,
		role: check.format,
		sha256: sha,
		mimeType: DIGITAL_FORMATS[check.format],
		byteSize: size,
		originalName: input.originalName?.slice(0, 200) ?? null,
		provenance: "device_file",
		rightsBasis: input.rightsBasis,
		sourceNote,
		rightsNote,
	};
	try {
		await storeVerified(
			ctx,
			sha,
			input.bytes,
			"The saved file did not match what was picked",
		);
	} catch (error) {
		await recordIntakeFailure(ctx, meta, error);
		throw error;
	}
	return ctx.database.write(async (db) => {
		await ensureStoredInCommit(ctx, sha, input.bytes);
		const now = ctx.clock();
		const fileId = `${id}:file`;
		await fileRepository.insertIfAbsent(db, {
			id: fileId,
			profileId,
			blobKey: sha,
			mimeType: meta.mimeType,
			byteSize: size,
			width: null,
			height: null,
			createdAt: now,
			updatedAt: now,
		});
		const existing = await bookAssetRepository.get(db, profileId, id);
		// Already saved: the stated rights stay as first recorded (a retry never rewrites them).
		if (existing?.intake === "saved" && !existing.removedAt) return existing;
		const saved = {
			intake: "saved" as const,
			lastError: null,
			removedAt: null,
			fileId,
			updatedAt: now,
		};
		if (existing) {
			await bookAssetRepository.update(db, profileId, id, saved);
			return { ...existing, ...saved };
		}
		const row: BookAsset = {
			...meta,
			pageIndex: null,
			createdAt: now,
			...saved,
		};
		await bookAssetRepository.insertIfAbsent(db, row);
		return row;
	});
}
