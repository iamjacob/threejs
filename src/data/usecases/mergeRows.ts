import type { Db } from "../db/database";
import { fileRepository } from "../repositories/files";
import { libraryBookRepository } from "../repositories/libraryBooks";
import { noteRepository } from "../repositories/notes";
import type { Profile } from "../schema";

export type MergeReport = {
	mergeId: string;
	sourceProfileId: string;
	targetProfileId: string;
	notesCopied: number;
	filesCopied: number;
	/** Guest note ids skipped because the target already had the same clientKey (target wins). */
	skippedConflicts: string[];
	booksCopied: number;
	/** Guest library-book ids skipped because the target had the same clientKey (target wins). */
	skippedBookConflicts: string[];
	/** True when this call found an already-completed merge and changed nothing. */
	alreadyCompleted: boolean;
};

export class MergeVerificationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MergeVerificationError";
	}
}

/** Deterministic ids: every retry produces the same rows, so ON CONFLICT DO NOTHING dedupes. */
export const mergeIdFor = (guestId: string, targetId: string) =>
	`merge:${guestId}:${targetId}`;
export const newAccountIdFor = (guestId: string) => `acct-${guestId}`;
export const copiedId = (mergeId: string, sourceId: string) =>
	`${mergeId}:${sourceId}`;

/** Copies guest files (metadata only; bytes are shared) and notes into the target profile. */
export async function copyRows(
	db: Db,
	mergeId: string,
	guest: Profile,
	account: Profile,
	now: number,
): Promise<MergeReport> {
	const report: MergeReport = {
		mergeId,
		sourceProfileId: guest.id,
		targetProfileId: account.id,
		notesCopied: 0,
		filesCopied: 0,
		skippedConflicts: [],
		booksCopied: 0,
		skippedBookConflicts: [],
		alreadyCompleted: false,
	};
	const fileIdMap = new Map<string, string>();
	for (const file of await fileRepository.listAll(db, guest.id)) {
		const id = copiedId(mergeId, file.id);
		fileIdMap.set(file.id, id);
		const copy = { ...file, id, profileId: account.id, updatedAt: now };
		if (await fileRepository.insertIfAbsent(db, copy)) report.filesCopied++;
	}
	for (const note of await noteRepository.listAll(db, guest.id)) {
		const id = copiedId(mergeId, note.id);
		const clash = await noteRepository.getByClientKey(
			db,
			account.id,
			note.clientKey,
		);
		if (clash) {
			if (clash.id !== id) report.skippedConflicts.push(note.id);
			continue;
		}
		const copy = {
			...note,
			id,
			profileId: account.id,
			fileId: note.fileId ? (fileIdMap.get(note.fileId) ?? null) : null,
			updatedAt: now,
		};
		if (await noteRepository.insertIfAbsent(db, copy)) report.notesCopied++;
	}
	// Library books (0002): same rules as notes. Same clientKey in the target (e.g. both added the
	// same catalog book) → target wins and the guest row is reported, never overwritten or dropped.
	const remap = (id: string | null) =>
		id ? (fileIdMap.get(id) ?? null) : null;
	for (const book of await libraryBookRepository.listAll(db, guest.id)) {
		const id = copiedId(mergeId, book.id);
		const clash = await libraryBookRepository.getByClientKey(
			db,
			account.id,
			book.clientKey,
		);
		if (clash) {
			if (clash.id !== id) report.skippedBookConflicts.push(book.id);
			continue;
		}
		const copy = {
			...book,
			id,
			profileId: account.id,
			coverFrontFileId: remap(book.coverFrontFileId),
			coverBackFileId: remap(book.coverBackFileId),
			coverSpineFileId: remap(book.coverSpineFileId),
			updatedAt: now,
		};
		if (await libraryBookRepository.insertIfAbsent(db, copy))
			report.booksCopied++;
	}
	return report;
}

/** Every guest row must be in the target as an intact copy, or be a recorded conflict. */
export async function verifyMerge(
	db: Db,
	mergeId: string,
	guestId: string,
	targetId: string,
	report: MergeReport,
) {
	const skipped = new Set(report.skippedConflicts);
	for (const note of await noteRepository.listAll(db, guestId)) {
		if (skipped.has(note.id)) continue;
		const copy = await noteRepository.get(
			db,
			targetId,
			copiedId(mergeId, note.id),
		);
		if (
			!copy ||
			copy.title !== note.title ||
			copy.body !== note.body ||
			copy.deletedAt !== note.deletedAt
		)
			throw new MergeVerificationError(`Note ${note.id} was not copied intact`);
	}
	for (const file of await fileRepository.listAll(db, guestId)) {
		const copy = await fileRepository.get(
			db,
			targetId,
			copiedId(mergeId, file.id),
		);
		if (!copy || copy.blobKey !== file.blobKey)
			throw new MergeVerificationError(`File ${file.id} was not copied intact`);
	}
	const skippedBooks = new Set(report.skippedBookConflicts ?? []);
	for (const book of await libraryBookRepository.listAll(db, guestId)) {
		if (skippedBooks.has(book.id)) continue;
		const copy = await libraryBookRepository.get(
			db,
			targetId,
			copiedId(mergeId, book.id),
		);
		const fileOk = (src: string | null, dst: string | null | undefined) =>
			src ? dst === copiedId(mergeId, src) : dst === null;
		if (
			!copy ||
			copy.clientKey !== book.clientKey ||
			copy.title !== book.title ||
			copy.deletedAt !== book.deletedAt ||
			!fileOk(book.coverFrontFileId, copy.coverFrontFileId) ||
			!fileOk(book.coverBackFileId, copy.coverBackFileId) ||
			!fileOk(book.coverSpineFileId, copy.coverSpineFileId)
		)
			throw new MergeVerificationError(`Book ${book.id} was not copied intact`);
	}
}
