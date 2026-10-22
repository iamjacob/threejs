import type { LngLat } from "./geo.ts";
import { step } from "./simulation.ts";
import type {
	GameCommand,
	GameEvent,
	PauseReason,
	WorldState,
} from "./types.ts";

export type GameListener = (event: GameEvent) => void;

/**
 * Fixed-timestep loop around the simulation.
 *
 * - `frame(nowMs)` is called by a driver (requestAnimationFrame) with a wall-clock time. Real time
 *   is accumulated and consumed in `fixedDt` steps, so outcomes do not depend on frame rate.
 * - Gaps longer than `maxFrameDt` (background tabs, debugger, device sleep) are dropped, not
 *   replayed, so the player never "teleports" after a resume.
 * - Pausing has reasons (user / background / loading); the loop runs only when none are active.
 *   Pausing clears steering so a stick release missed while hidden cannot cause runaway motion.
 * - Events are delivered after the steps of a frame, never during a step.
 */
export class GameLoop {
	readonly world: WorldState;
	private accumulator = 0;
	private lastNow: number | undefined;
	private readonly pauses = new Set<PauseReason>();
	private readonly listeners = new Set<GameListener>();
	private readonly pending: GameEvent[] = [];
	private readonly prev: LngLat;
	private disposed = false;

	constructor(world: WorldState) {
		this.world = world;
		this.prev = { ...world.player.position };
	}

	get paused() {
		return this.pauses.size > 0;
	}

	get pauseReasons(): readonly PauseReason[] {
		return [...this.pauses];
	}

	dispatch(command: GameCommand) {
		if (this.disposed) return;
		const { world } = this;
		switch (command.type) {
			case "steer":
				// Ignored while paused: a paused game does not queue movement.
				if (this.paused) return;
				world.intentX = Number.isFinite(command.x) ? command.x : 0;
				world.intentY = Number.isFinite(command.y) ? command.y : 0;
				return;
			case "view":
				if (Number.isFinite(command.bearing)) world.bearing = command.bearing;
				return;
			case "teleport": {
				const { player } = world;
				player.position.lng = command.position.lng;
				player.position.lat = command.position.lat;
				player.velocityEast = 0;
				player.velocityNorth = 0;
				this.prev.lng = command.position.lng;
				this.prev.lat = command.position.lat;
				if (player.moving) {
					player.moving = false;
					this.pending.push({ type: "moving-stopped" });
				}
				world.intentX = 0;
				world.intentY = 0;
				this.flush();
				return;
			}
		}
	}

	pause(reason: PauseReason) {
		if (this.disposed || this.pauses.has(reason)) return;
		const wasPaused = this.paused;
		this.pauses.add(reason);
		this.world.intentX = 0;
		this.world.intentY = 0;
		if (!wasPaused) {
			// Stop immediately; a paused tornado should not glide on its velocity after resume.
			const { player } = this.world;
			player.velocityEast = 0;
			player.velocityNorth = 0;
			if (player.moving) {
				player.moving = false;
				this.pending.push({ type: "moving-stopped" });
			}
			this.pending.push({ type: "paused", reason });
			this.flush();
		}
	}

	resume(reason: PauseReason) {
		if (this.disposed || !this.pauses.delete(reason)) return;
		if (!this.paused) {
			this.accumulator = 0;
			this.lastNow = undefined; // next frame establishes a new baseline: no catch-up
			this.pending.push({ type: "resumed" });
			this.flush();
		}
	}

	/** Driver entry point. `nowMs` is a monotonic clock (performance.now / rAF timestamp). */
	frame(nowMs: number) {
		if (this.disposed) return;
		if (this.paused || this.lastNow === undefined) {
			this.lastNow = nowMs;
			return;
		}
		const dt = (nowMs - this.lastNow) / 1000;
		this.lastNow = nowMs;
		this.advance(dt);
	}

	/** Simulates `realDt` seconds of real time (clamped). Exposed for tests and drivers. */
	advance(realDt: number) {
		if (this.disposed || this.paused || !(realDt > 0)) return;
		const { config } = this.world;
		this.accumulator += Math.min(realDt, config.maxFrameDt);
		const { position } = this.world.player;
		// Tolerance: frames of exactly 1000/60 ms sum to slightly less than n·fixedDt in floating
		// point, which would otherwise drop a step and make outcomes frame-rate dependent.
		const eps = config.fixedDt * 1e-6;
		while (this.accumulator >= config.fixedDt - eps) {
			this.prev.lng = position.lng;
			this.prev.lat = position.lat;
			step(this.world, config.fixedDt, this.pending);
			this.accumulator = Math.max(0, this.accumulator - config.fixedDt);
		}
		this.flush();
	}

	/** Render position: interpolated between the last two steps. Writes into `out`. */
	interpolated(out: LngLat): LngLat {
		const alpha = this.paused
			? 1
			: Math.min(1, this.accumulator / this.world.config.fixedDt);
		const { position } = this.world.player;
		out.lng = this.prev.lng + (position.lng - this.prev.lng) * alpha;
		out.lat = this.prev.lat + (position.lat - this.prev.lat) * alpha;
		return out;
	}

	subscribe(listener: GameListener) {
		if (this.disposed) return () => {};
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	dispose() {
		this.disposed = true;
		this.listeners.clear();
		this.pending.length = 0;
	}

	get isDisposed() {
		return this.disposed;
	}

	private flush() {
		if (!this.pending.length) return;
		for (let i = 0; i < this.pending.length; i++) {
			const event = this.pending[i];
			for (const listener of this.listeners) listener(event);
		}
		this.pending.length = 0;
	}
}
