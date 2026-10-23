import { settingsRepository } from "../data/repositories/settings";
import type { DataContext } from "../data/usecases/context";
import { distanceMeters, type LngLat, MAX_LATITUDE } from "./core/geo";

/**
 * Durable game progress for this slice: ONE explicit checkpoint per profile, written only on
 * pause / background / route exit (never per frame). Stored in the existing profile-scoped
 * `profile_settings` table (migration 0000), so no new migration is needed.
 *
 * The position is the in-game tornado on the map, not the device's GPS location.
 */
export const CHECKPOINT_KEY = "game.map.checkpoint";
export const CHECKPOINT_VERSION = 1;

export type MapCheckpoint = {
	v: typeof CHECKPOINT_VERSION;
	lng: number;
	lat: number;
	savedAt: number;
};

export function isValidCheckpoint(value: unknown): value is MapCheckpoint {
	if (!value || typeof value !== "object") return false;
	const c = value as Partial<MapCheckpoint>;
	return (
		c.v === CHECKPOINT_VERSION &&
		typeof c.lng === "number" &&
		typeof c.lat === "number" &&
		Number.isFinite(c.lng) &&
		Number.isFinite(c.lat) &&
		Math.abs(c.lng) <= 180 &&
		Math.abs(c.lat) <= MAX_LATITUDE &&
		typeof c.savedAt === "number"
	);
}

/** Returns the saved position, or undefined if none / invalid / outside the play area. */
export async function loadMapCheckpoint(
	ctx: DataContext,
	profileId: string,
	{ home, maxDistance }: { home: LngLat; maxDistance: number },
): Promise<MapCheckpoint | undefined> {
	const value = await ctx.database.read((db) =>
		settingsRepository.get<unknown>(db, profileId, CHECKPOINT_KEY),
	);
	if (!isValidCheckpoint(value)) return undefined;
	// A checkpoint from a different home / build must not strand the player off-map.
	if (distanceMeters(home, value) > maxDistance * 1.01) return undefined;
	return value;
}

/**
 * Saves the checkpoint. Skips the write when the position has not moved meaningfully since
 * `previous`, so repeated pauses (and React StrictMode remounts) do not spam the database.
 * Returns the checkpoint now on disk.
 */
export async function saveMapCheckpoint(
	ctx: DataContext,
	profileId: string,
	position: LngLat,
	previous?: MapCheckpoint,
	{ minMeters = 1 }: { minMeters?: number } = {},
): Promise<{ checkpoint: MapCheckpoint; written: boolean }> {
	if (!Number.isFinite(position.lng) || !Number.isFinite(position.lat))
		throw new Error("Invalid checkpoint position");
	if (previous && distanceMeters(previous, position) < minMeters)
		return { checkpoint: previous, written: false };
	const checkpoint: MapCheckpoint = {
		v: CHECKPOINT_VERSION,
		lng: position.lng,
		lat: position.lat,
		savedAt: ctx.clock(),
	};
	await ctx.database.write((db) =>
		settingsRepository.set(
			db,
			profileId,
			CHECKPOINT_KEY,
			checkpoint,
			checkpoint.savedAt,
		),
	);
	return { checkpoint, written: true };
}
