import type { Db } from "../db/database";
import { noteRepository } from "../repositories/notes";
import { type OutboxChange, outboxRepository } from "../repositories/outbox";
import type { Note } from "../schema";
import { type DataContext, NotFoundError, ValidationError } from "./context";

export const NOTE_TITLE_MAX = 120;
export const NOTE_BODY_MAX = 10_000;

export type NoteInput = { title: string; body?: string; clientKey?: string };

function validate(input: { title?: string; body?: string }) {
	const title = input.title?.trim();
	if (title !== undefined) {
		if (!title) throw new ValidationError("Title is required", "title");
		if (title.length > NOTE_TITLE_MAX)
			throw new ValidationError(
				`Title is over ${NOTE_TITLE_MAX} characters`,
				"title",
			);
	}
	if (input.body !== undefined && input.body.length > NOTE_BODY_MAX)
		throw new ValidationError(
			`Body is over ${NOTE_BODY_MAX} characters`,
			"body",
		);
	return { title, body: input.body };
}

/** Records the outbox change in the caller's transaction (same commit as the data change). */
export function recordChange(
	ctx: DataContext,
	db: Db,
	change: OutboxChange,
	now: number,
) {
	return outboxRepository.record(db, change, ctx.newId(), now);
}

export function listNotes(ctx: DataContext, profileId: string) {
	return ctx.database.read((db) => noteRepository.listActive(db, profileId));
}

/** Creates a note and its outbox entry in one transaction. Same clientKey = same note (idempotent). */
export async function createNote(
	ctx: DataContext,
	profileId: string,
	input: NoteInput,
): Promise<Note> {
	const { title, body } = validate({
		title: input.title,
		body: input.body ?? "",
	});
	const clientKey = input.clientKey ?? ctx.newId();
	return ctx.database.write(async (db) => {
		const existing = await noteRepository.getByClientKey(
			db,
			profileId,
			clientKey,
		);
		if (existing) return existing;
		const now = ctx.clock();
		const note: Note = {
			id: ctx.newId(),
			profileId,
			clientKey,
			title: title as string,
			body: body ?? "",
			fileId: null,
			pinned: false,
			deletedAt: null,
			createdAt: now,
			updatedAt: now,
		};
		await noteRepository.insert(db, note);
		await recordChange(
			ctx,
			db,
			{
				profileId,
				entity: "note",
				entityId: note.id,
				op: "create",
				idempotencyKey: `note:${note.id}:create`,
				payload: note,
			},
			now,
		);
		return note;
	});
}

export async function updateNote(
	ctx: DataContext,
	profileId: string,
	id: string,
	patch: { title?: string; body?: string; pinned?: boolean },
): Promise<Note> {
	const { title, body } = validate(patch);
	return ctx.database.write(async (db) => {
		const current = await noteRepository.get(db, profileId, id);
		if (!current || current.deletedAt) throw new NotFoundError("Note");
		const now = Math.max(ctx.clock(), current.updatedAt + 1);
		const next = {
			title: title ?? current.title,
			body: body ?? current.body,
			pinned: patch.pinned ?? current.pinned,
			updatedAt: now,
		};
		await noteRepository.update(db, profileId, id, next);
		await recordChange(
			ctx,
			db,
			{
				profileId,
				entity: "note",
				entityId: id,
				op: "update",
				idempotencyKey: `note:${id}:update:${now}`,
				payload: next,
			},
			now,
		);
		return { ...current, ...next };
	});
}

/** Soft delete, so a later sync can propagate the tombstone. Deleting twice is a no-op. */
export async function deleteNote(
	ctx: DataContext,
	profileId: string,
	id: string,
) {
	await ctx.database.write(async (db) => {
		const current = await noteRepository.get(db, profileId, id);
		if (!current) throw new NotFoundError("Note");
		if (current.deletedAt) return;
		const now = Math.max(ctx.clock(), current.updatedAt + 1);
		await noteRepository.update(db, profileId, id, {
			deletedAt: now,
			updatedAt: now,
		});
		await recordChange(
			ctx,
			db,
			{
				profileId,
				entity: "note",
				entityId: id,
				op: "delete",
				idempotencyKey: `note:${id}:delete`,
				payload: { deletedAt: now },
			},
			now,
		);
	});
}
