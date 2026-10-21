import { and, eq } from "drizzle-orm";
import { affectedRows, type Db } from "../db/database";
import { type FileRecord, files } from "../schema";

export const fileRepository = {
	get(db: Db, profileId: string, id: string): Promise<FileRecord | undefined> {
		return db
			.select()
			.from(files)
			.where(and(eq(files.profileId, profileId), eq(files.id, id)))
			.get();
	},
	listAll(db: Db, profileId: string): Promise<FileRecord[]> {
		return db
			.select()
			.from(files)
			.where(eq(files.profileId, profileId))
			.orderBy(files.id)
			.all();
	},
	async insertIfAbsent(db: Db, record: FileRecord): Promise<boolean> {
		const result = await db
			.insert(files)
			.values(record)
			.onConflictDoNothing()
			.run();
		return affectedRows(result) > 0;
	},
};
