import type { Db } from "../db/database";
import { profileRepository } from "../repositories/profiles";
import { directoryRepository } from "../repositories/sharedDevice";
import type { Profile } from "../schema";
import { type DataContext, NotFoundError, ValidationError } from "./context";

/**
 * Several people sharing ONE device, fully offline (migration 0003).
 *
 * - Profiles are an organization/privacy boundary inside the app, NOT encryption: anyone holding
 *   the device or its files can read the database.
 * - The "On this device" directory lists profiles in THIS database whose owner opted in. It is not
 *   a people search and never reaches other devices or a server.
 */

export const PROFILE_NAME_MAX = 40;

/** A profile reachable on this device. `origin` keeps it distinct from any remote user id. */
export type DeviceDirectoryEntry = {
	origin: "this_device";
	profileId: string;
	publicName: string;
};

export function cleanName(value: string, field: string) {
	const name = value?.trim() ?? "";
	if (!name) throw new ValidationError("Name is required", field);
	if (name.length > PROFILE_NAME_MAX)
		throw new ValidationError(
			`Name is over ${PROFILE_NAME_MAX} characters`,
			field,
		);
	return name;
}

/** The profile must exist and not be archived (merged). Never falls back to another profile. */
export async function requireProfile(db: Db, profileId: string) {
	const profile = await profileRepository.get(db, profileId);
	if (!profile || profile.mergedInto) throw new NotFoundError("Profile");
	return profile;
}

/**
 * Adds another person to this device without an account or network. Does NOT switch to them and
 * does NOT make them discoverable (visibility stays off until that person opts in).
 */
export async function createLocalProfile(
	ctx: DataContext,
	input: { displayName: string },
): Promise<Profile> {
	const displayName = cleanName(input.displayName, "displayName");
	return ctx.database.write(async (db) => {
		const now = ctx.clock();
		const profile: Profile = {
			id: `local-${ctx.newId()}`,
			kind: "local",
			displayName,
			remoteAccountId: null,
			mergedInto: null,
			createdAt: now,
			updatedAt: now,
		};
		await profileRepository.insert(db, profile);
		return profile;
	});
}

/** The owner's own visibility setting (call with the active profile only). */
export async function getDeviceVisibility(
	ctx: DataContext,
	profileId: string,
): Promise<{ visible: false } | { visible: true; publicName: string }> {
	const row = await ctx.database.read((db) =>
		directoryRepository.get(db, profileId),
	);
	return row
		? { visible: true, publicName: row.publicName }
		: { visible: false };
}

/** Opt in (or rename) in the "On this device" directory. Only `publicName` is ever shown. */
export async function setDeviceVisibility(
	ctx: DataContext,
	profileId: string,
	input: { publicName: string },
) {
	const publicName = cleanName(input.publicName, "publicName");
	await ctx.database.write(async (db) => {
		await requireProfile(db, profileId);
		await directoryRepository.upsert(db, profileId, publicName, ctx.clock());
	});
}

/**
 * Opt out. Removes the profile from FUTURE directory lookups immediately. Does not delete the
 * profile, its library, notes, files or existing conversations.
 */
export async function hideFromDevice(ctx: DataContext, profileId: string) {
	await ctx.database.write((db) => directoryRepository.remove(db, profileId));
}

/** Opted-in profiles on this device, excluding the viewer. Public fields only. */
export async function listDeviceDirectory(
	ctx: DataContext,
	viewerProfileId: string,
): Promise<DeviceDirectoryEntry[]> {
	return ctx.database.read(async (db) => {
		await requireProfile(db, viewerProfileId);
		const rows = await directoryRepository.listVisible(db, viewerProfileId);
		return rows.map((r) => ({
			origin: "this_device" as const,
			profileId: r.profileId,
			publicName: r.publicName,
		}));
	});
}
