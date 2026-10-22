import { DEFAULT_GAME_CONFIG } from "./config.ts";
import {
	type LngLat,
	metersBetween,
	offsetByMeters,
	screenToWorld,
} from "./geo.ts";
import type { GameConfig, GameEvent, WorldState } from "./types.ts";

export function createWorld(
	home: LngLat,
	config: Partial<GameConfig> = {},
	start: LngLat = home,
): WorldState {
	return {
		config: { ...DEFAULT_GAME_CONFIG, ...config },
		home: { ...home },
		tick: 0,
		time: 0,
		player: {
			position: { ...start },
			velocityEast: 0,
			velocityNorth: 0,
			moving: false,
		},
		intentX: 0,
		intentY: 0,
		bearing: 0,
		atBoundary: false,
	};
}

// Scratch values reused every step (the step runs up to 60×/s; do not allocate in it).
const dir: [number, number] = [0, 0];
const offset: [number, number] = [0, 0];

/** Events are shared constants, so emitting one allocates nothing. */
function emit(events: GameEvent[], event: GameEvent) {
	events.push(event);
}
const MOVING_STARTED: GameEvent = { type: "moving-started" };
const MOVING_STOPPED: GameEvent = { type: "moving-stopped" };
const BOUNDARY: GameEvent = { type: "boundary-reached" };

/**
 * Advances the world by exactly `dt` simulated seconds. Deterministic: the same commands and
 * steps always give the same state. Mutates `world`; appends events to `events`.
 */
export function step(world: WorldState, dt: number, events: GameEvent[]) {
	const { config, player } = world;

	// 1. Intent (screen space, unit disk) → target ground velocity (world space).
	let ix = world.intentX;
	let iy = world.intentY;
	const mag = Math.hypot(ix, iy);
	if (mag > 1) {
		ix /= mag;
		iy /= mag;
	}
	screenToWorld(ix, iy, world.bearing, dir);
	const targetEast = dir[0] * config.maxSpeed;
	const targetNorth = dir[1] * config.maxSpeed;

	// 2. Frame-rate independent exponential approach to the target velocity.
	const k = 1 - Math.exp(-config.response * dt);
	player.velocityEast += (targetEast - player.velocityEast) * k;
	player.velocityNorth += (targetNorth - player.velocityNorth) * k;
	const speed = Math.hypot(player.velocityEast, player.velocityNorth);
	if (mag === 0 && speed < 1e-3) {
		player.velocityEast = 0;
		player.velocityNorth = 0;
	}

	// 3. Integrate position on the ground plane.
	offsetByMeters(
		player.position,
		player.velocityEast * dt,
		player.velocityNorth * dt,
		player.position,
	);

	// 4. Keep the player inside the play area around home.
	metersBetween(world.home, player.position, offset);
	const r = Math.hypot(offset[0], offset[1]);
	if (r > config.maxDistance) {
		const f = config.maxDistance / r;
		offsetByMeters(world.home, offset[0] * f, offset[1] * f, player.position);
		// Remove the outward velocity component so the player slides along the edge.
		const nx = offset[0] / r;
		const ny = offset[1] / r;
		const outward = player.velocityEast * nx + player.velocityNorth * ny;
		if (outward > 0) {
			player.velocityEast -= outward * nx;
			player.velocityNorth -= outward * ny;
		}
		if (!world.atBoundary) {
			world.atBoundary = true;
			emit(events, BOUNDARY);
		}
	} else if (world.atBoundary && r < config.maxDistance * 0.98) {
		world.atBoundary = false;
	}

	// 5. Moving state with hysteresis, so tiny speed jitter cannot spam events.
	const now = Math.hypot(player.velocityEast, player.velocityNorth);
	if (!player.moving && now > config.startMovingSpeed) {
		player.moving = true;
		emit(events, MOVING_STARTED);
	} else if (player.moving && now < config.stopMovingSpeed) {
		player.moving = false;
		emit(events, MOVING_STOPPED);
	}

	world.tick++;
	world.time += dt;
}
