import { eq } from "drizzle-orm";
import type { Db } from "../db/database";
import { appState, type Profile, profiles } from "../schema";

const ACTIVE_PROFILE_KEY = "active_profile_id";

export const profileRepository = {
	get(db: Db, id: string): Promise<Profile | undefined> {
		return db.select().from(profiles).where(eq(profiles.id, id)).get();
	},
	list(db: Db): Promise<Profile[]> {
		return db.select().from(profiles).orderBy(profiles.createdAt).all();
	},
	async insert(db: Db, profile: Profile) {
		await db.insert(profiles).values(profile).onConflictDoNothing();
	},
	async markMerged(db: Db, id: string, targetId: string, now: number) {
		await db
			.update(profiles)
			.set({ mergedInto: targetId, updatedAt: now })
			.where(eq(profiles.id, id));
	},
	async getActiveId(db: Db): Promise<string | undefined> {
		const row = await db
			.select()
			.from(appState)
			.where(eq(appState.key, ACTIVE_PROFILE_KEY))
			.get();
		return row?.value;
	},
	async setActiveId(db: Db, id: string) {
		await db
			.insert(appState)
			.values({ key: ACTIVE_PROFILE_KEY, value: id })
			.onConflictDoUpdate({ target: appState.key, set: { value: id } });
	},
};
