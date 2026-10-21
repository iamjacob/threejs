import { and, eq } from "drizzle-orm";
import type { Db } from "../db/database";
import { profileSettings } from "../schema";

/**
 * Per-profile settings. This is the seam for moving localStorage keys into SQLite later
 * (e.g. Qwen's `boooks-shelf-level` → key "shelf.libraryLevel"). Not wired to any store yet.
 */
export const settingsRepository = {
	async get<T>(db: Db, profileId: string, key: string): Promise<T | undefined> {
		const row = await db
			.select()
			.from(profileSettings)
			.where(
				and(eq(profileSettings.profileId, profileId), eq(profileSettings.key, key)),
			)
			.get();
		return row ? (JSON.parse(row.valueJson) as T) : undefined;
	},
	async set(db: Db, profileId: string, key: string, value: unknown, now: number) {
		const valueJson = JSON.stringify(value);
		await db
			.insert(profileSettings)
			.values({ profileId, key, valueJson, updatedAt: now })
			.onConflictDoUpdate({
				target: [profileSettings.profileId, profileSettings.key],
				set: { valueJson, updatedAt: now },
			});
	},
};
