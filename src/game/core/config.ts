import type { LngLat } from "./geo.ts";
import type { GameConfig } from "./types.ts";

export const DEFAULT_GAME_CONFIG: GameConfig = {
	maxSpeed: 35,
	response: 6,
	maxDistance: 5000,
	fixedDt: 1 / 60,
	maxFrameDt: 0.25,
	startMovingSpeed: 0.5,
	stopMovingSpeed: 0.2,
};

/**
 * Start position and map camera, taken from the old Expo app's
 * `src/features/maps/map-experience.web.tsx` HOME (Vejle). Not GPS.
 */
export const HOME: LngLat = { lng: 9.55368, lat: 55.707813 };
export const HOME_VIEW = { bearing: -16, pitch: 66, zoom: 16.15 } as const;
