import type { Profile } from "../data/schema";
import type { DataContext } from "../data/usecases/context";
import { ensureActiveProfile, switchProfile } from "../data/usecases/profiles";

/**
 * One explicit profile switch for every profile-bound store. Order is the privacy rule:
 * 1. "clear": every subscriber drops the previous person's in-memory data (books, notes,
 *    conversations, drafts) synchronously, BEFORE any await, so nothing can flash.
 * 2. The switch is persisted (SQLite app_state).
 * 3. "ready": subscribers load the next profile. A switch that fails reopens the profile that is
 *    actually active in SQLite (never a guess).
 * `generation` lets async loaders drop results that finished after a newer switch.
 */
export type SessionEvent =
	| { phase: "clear"; generation: number }
	| { phase: "ready"; generation: number; profile: Profile };

const listeners = new Set<(event: SessionEvent) => void>();
let generation = 0;

export const currentGeneration = () => generation;

export function onProfileSession(listener: (event: SessionEvent) => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function emit(event: SessionEvent) {
	for (const listener of listeners) listener(event);
}

export async function switchActiveProfile(
	ctx: DataContext,
	profileId: string,
): Promise<Profile> {
	const mine = ++generation;
	emit({ phase: "clear", generation: mine });
	try {
		const profile = await switchProfile(ctx, profileId);
		if (mine === generation)
			emit({ phase: "ready", generation: mine, profile });
		return profile;
	} catch (error) {
		const profile = await ensureActiveProfile(ctx);
		if (mine === generation)
			emit({ phase: "ready", generation: mine, profile });
		throw error;
	}
}
