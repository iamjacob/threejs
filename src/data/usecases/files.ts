import { sha256Hex } from "../ids";
import { fileRepository } from "../repositories/files";
import { noteRepository } from "../repositories/notes";
import type { Note } from "../schema";
import { type DataContext, NotFoundError, ValidationError } from "./context";
import { recordChange } from "./notes";

export const FILE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
]);

export type ImageInput = {
	bytes: Uint8Array;
	mimeType: string;
	width?: number;
	height?: number;
};

/**
 * Writes the bytes to the FileStore *first* (content-addressed and idempotent), then commits the
 * metadata row and the note link in SQLite. If the commit fails, the orphan blob is harmless and
 * is reused on retry because its key is the content hash.
 */
export async function attachImage(
	ctx: DataContext,
	profileId: string,
	noteId: string,
	image: ImageInput,
): Promise<Note> {
	if (!IMAGE_TYPES.has(image.mimeType))
		throw new ValidationError(
			`Unsupported image type ${image.mimeType}`,
			"file",
		);
	if (image.bytes.byteLength === 0 || image.bytes.byteLength > FILE_MAX_BYTES)
		throw new ValidationError("Image must be between 1 byte and 10 MB", "file");
	const blobKey = await sha256Hex(image.bytes);
	await ctx.files.put(blobKey, image.bytes);
	return ctx.database.write(async (db) => {
		const note = await noteRepository.get(db, profileId, noteId);
		if (!note || note.deletedAt) throw new NotFoundError("Note");
		const now = Math.max(ctx.clock(), note.updatedAt + 1);
		const fileId = ctx.newId();
		await fileRepository.insertIfAbsent(db, {
			id: fileId,
			profileId,
			blobKey,
			mimeType: image.mimeType,
			byteSize: image.bytes.byteLength,
			width: image.width ?? null,
			height: image.height ?? null,
			createdAt: now,
			updatedAt: now,
		});
		await noteRepository.update(db, profileId, noteId, {
			fileId,
			updatedAt: now,
		});
		await recordChange(
			ctx,
			db,
			{
				profileId,
				entity: "file",
				entityId: fileId,
				op: "create",
				idempotencyKey: `file:${fileId}:create`,
				payload: {
					noteId,
					blobKey,
					mimeType: image.mimeType,
					byteSize: image.bytes.byteLength,
				},
			},
			now,
		);
		return { ...note, fileId, updatedAt: now };
	});
}

/** Profile-scoped metadata lookup, then bytes. Missing bytes are reported, not hidden. */
export async function readFile(
	ctx: DataContext,
	profileId: string,
	fileId: string,
) {
	const record = await ctx.database.read((db) =>
		fileRepository.get(db, profileId, fileId),
	);
	if (!record) throw new NotFoundError("File");
	const bytes = await ctx.files.get(record.blobKey);
	return { record, bytes, missing: bytes === undefined };
}
