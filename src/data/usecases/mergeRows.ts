import type { Db } from "../db/database";
import { fileRepository } from "../repositories/files";
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
		const clash = await noteRepository.getByClientKey(db, account.id, note.clientKey);
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
		const copy = await noteRepository.get(db, targetId, copiedId(mergeId, note.id));
		if (
			!copy ||
			copy.title !== note.title ||
			copy.body !== note.body ||
			copy.deletedAt !== note.deletedAt
		)
			throw new MergeVerificationError(`Note ${note.id} was not copied intact`);
	}
	for (const file of await fileRepository.listAll(db, guestId)) {
		const copy = await fileRepository.get(db, targetId, copiedId(mergeId, file.id));
		if (!copy || copy.blobKey !== file.blobKey)
			throw new MergeVerificationError(`File ${file.id} was not copied intact`);
	}
}
