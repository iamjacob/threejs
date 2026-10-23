import type { LngLat } from "./geo.ts";

/** Input → command. Commands are the only way input changes the simulation. */
export type GameCommand =
	/** Screen-relative steering intent on the unit disk (x right, y up). Latest one wins. */
	| { type: "steer"; x: number; y: number }
	/** Current map bearing in degrees, so "up" on the stick means "up on screen". */
	| { type: "view"; bearing: number }
	/** Place the player (restore a checkpoint). Stops motion. */
	| { type: "teleport"; position: LngLat };

/** Simulation → presentation. Low frequency by design (never one per frame). */
export type GameEvent =
	| { type: "moving-started" }
	| { type: "moving-stopped" }
	| { type: "paused"; reason: PauseReason }
	| { type: "resumed" }
	| { type: "boundary-reached" };

export type PauseReason = "user" | "background" | "loading";

export type GameConfig = {
	/** Top speed in ground meters per second. */
	maxSpeed: number;
	/** How fast velocity approaches the target (1/s). Higher = snappier. */
	response: number;
	/** Play area radius around `home`, ground meters. */
	maxDistance: number;
	/** Fixed simulation step, seconds. */
	fixedDt: number;
	/** Longest real frame the loop will simulate; longer gaps (background tabs) are dropped. */
	maxFrameDt: number;
	startMovingSpeed: number;
	stopMovingSpeed: number;
};

export type PlayerState = {
	position: LngLat;
	velocityEast: number;
	velocityNorth: number;
	moving: boolean;
};

export type WorldState = {
	config: GameConfig;
	home: LngLat;
	tick: number;
	/** Simulated seconds (sum of fixed steps). */
	time: number;
	player: PlayerState;
	intentX: number;
	intentY: number;
	bearing: number;
	atBoundary: boolean;
};
