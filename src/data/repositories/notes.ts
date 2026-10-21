import { and, desc, eq, isNull } from "drizzle-orm";
import { affectedRows, type Db } from "../db/database";
import { type Note, notes } from "../schema";

/** Every method requires profileId and filters on it, so one profile can never read another's rows. */
export const noteRepository = {
	listActive(db: Db, profileId: string): Promise<Note[]> {
		return db
			.select()
			.from(notes)
			.where(and(eq(notes.profileId, profileId), isNull(notes.deletedAt)))
			.orderBy(desc(notes.pinned), desc(notes.updatedAt), notes.id)
			.all();
	},
	/** Includes soft-deleted rows (used by promotion). */
	listAll(db: Db, profileId: string): Promise<Note[]> {
		return db
			.select()
			.from(notes)
			.where(eq(notes.profileId, profileId))
			.orderBy(notes.id)
			.all();
	},
	get(db: Db, profileId: string, id: string): Promise<Note | undefined> {
		return db
			.select()
			.from(notes)
			.where(and(eq(notes.profileId, profileId), eq(notes.id, id)))
			.get();
	},
	getByClientKey(
		db: Db,
		profileId: string,
		clientKey: string,
	): Promise<Note | undefined> {
		return db
			.select()
			.from(notes)
			.where(and(eq(notes.profileId, profileId), eq(notes.clientKey, clientKey)))
			.get();
	},
	async insert(db: Db, note: Note) {
		await db.insert(notes).values(note);
	},
	/** Insert unless the id or (profile, clientKey) already exists. Returns true if inserted. */
	async insertIfAbsent(db: Db, note: Note): Promise<boolean> {
		const result = await db.insert(notes).values(note).onConflictDoNothing().run();
		return affectedRows(result) > 0;
	},
	async update(
		db: Db,
		profileId: string,
		id: string,
		patch: Partial<Pick<Note, "title" | "body" | "pinned" | "fileId" | "deletedAt" | "updatedAt">>,
	) {
		await db
			.update(notes)
			.set(patch)
			.where(and(eq(notes.profileId, profileId), eq(notes.id, id)));
	},
};
