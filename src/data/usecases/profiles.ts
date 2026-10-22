import { profileRepository } from "../repositories/profiles";
import type { Profile } from "../schema";
import { type DataContext, NotFoundError } from "./context";

/**
 * Returns the active profile, creating a durable guest on first launch.
 * Works fully offline; no account needed.
 */
export async function ensureActiveProfile(ctx: DataContext): Promise<Profile> {
	return ctx.database.write(async (db) => {
		const activeId = await profileRepository.getActiveId(db);
		const active = activeId
			? await profileRepository.get(db, activeId)
			: undefined;
		if (active && !active.mergedInto) return active;
		if (active?.mergedInto) {
			// A merged guest must not stay active; follow it to the account.
			const target = await profileRepository.get(db, active.mergedInto);
			if (target) {
				await profileRepository.setActiveId(db, target.id);
				return target;
			}
		}
		const now = ctx.clock();
		const guest: Profile = {
			id: `guest-${ctx.newId()}`,
			kind: "guest",
			displayName: "Guest",
			remoteAccountId: null,
			mergedInto: null,
			createdAt: now,
			updatedAt: now,
		};
		await profileRepository.insert(db, guest);
		await profileRepository.setActiveId(db, guest.id);
		return guest;
	});
}

/** The currently active profile id (read-only; no guest is created). */
export function getActiveProfileId(
	ctx: DataContext,
): Promise<string | undefined> {
	return ctx.database.read((db) => profileRepository.getActiveId(db));
}

/**
 * The active profile from SQLite, read-only (no flush). Undefined if none, missing or archived;
 * callers then use ensureActiveProfile, which never picks another existing person's profile.
 */
export async function getActiveProfile(
	ctx: DataContext,
): Promise<Profile | undefined> {
	return ctx.database.read(async (db) => {
		const id = await profileRepository.getActiveId(db);
		const profile = id ? await profileRepository.get(db, id) : undefined;
		return profile && !profile.mergedInto ? profile : undefined;
	});
}

/** Active profile for UI loaders: read-only when valid, otherwise the safe ensure path. */
export async function resolveActiveProfile(ctx: DataContext): Promise<Profile> {
	return (await getActiveProfile(ctx)) ?? ensureActiveProfile(ctx);
}

/** Profiles a user can switch to (merged guests are archived and hidden). */
export async function listProfiles(ctx: DataContext): Promise<Profile[]> {
	const all = await ctx.database.read((db) => profileRepository.list(db));
	return all.filter((p) => !p.mergedInto);
}

export async function switchProfile(ctx: DataContext, profileId: string) {
	return ctx.database.write(async (db) => {
		const profile = await profileRepository.get(db, profileId);
		if (!profile || profile.mergedInto) throw new NotFoundError("Profile");
		await profileRepository.setActiveId(db, profile.id);
		return profile;
	});
}
