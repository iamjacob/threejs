import type { LngLat } from "../core/geo.ts";
import { GameLoop } from "../core/loop.ts";
import { createWorld } from "../core/simulation.ts";
import type { GameConfig, GameEvent } from "../core/types.ts";

/**
 * Browser driver for the headless GameLoop. Owns the ONLY requestAnimationFrame loop for the
 * simulation, the visibility (background) handling, and camera following. It is plain TS with
 * injectable environment hooks so its lifecycle can be tested headlessly.
 *
 * Per frame it: advances the simulation, feeds the map bearing back as a `view` command, and (if
 * following) centers the map camera on the interpolated player. No React state, no Zustand
 * writes, no SQLite writes happen per frame; those only happen on low-frequency GameEvents.
 */
export type MapCamera = {
	getBearing(): number;
	/** Center the camera on a point without animation (render-state only). */
	jumpTo(center: LngLat): void;
};

export type RuntimeEnv = {
	requestFrame(cb: (now: number) => void): number;
	cancelFrame(id: number): void;
	/** Returns an unsubscribe. `hidden` is true when the app goes to the background. */
	onVisibility(cb: (hidden: boolean) => void): () => void;
	isHidden(): boolean;
};

export function browserEnv(): RuntimeEnv {
	return {
		requestFrame: (cb) => requestAnimationFrame(cb),
		cancelFrame: (id) => cancelAnimationFrame(id),
		onVisibility(cb) {
			const onChange = () => cb(document.visibilityState === "hidden");
			// pagehide covers iOS/WebView cases where visibilitychange is unreliable on exit.
			const onHide = () => cb(true);
			document.addEventListener("visibilitychange", onChange);
			window.addEventListener("pagehide", onHide);
			return () => {
				document.removeEventListener("visibilitychange", onChange);
				window.removeEventListener("pagehide", onHide);
			};
		},
		isHidden: () => document.visibilityState === "hidden",
	};
}

export type RuntimeOptions = {
	home: LngLat;
	config?: Partial<GameConfig>;
	env?: RuntimeEnv;
	/** Called (low frequency) whenever the game pauses; the place to write a checkpoint. */
	onCheckpoint?: (position: LngLat) => void;
};

/** Number of runtimes currently driving frames. Exposed for remount/duplication tests. */
let activeDrivers = 0;
export const activeDriverCount = () => activeDrivers;

export class MapPlayRuntime {
	readonly loop: GameLoop;
	private readonly env: RuntimeEnv;
	private readonly onCheckpoint?: (position: LngLat) => void;
	private camera: MapCamera | undefined;
	private frameId: number | undefined;
	private offVisibility: (() => void) | undefined;
	private offLoop: () => void;
	private following = true;
	private disposed = false;
	private readonly scratch: LngLat = { lng: 0, lat: 0 };
	private lastBearing = Number.NaN;

	constructor(options: RuntimeOptions) {
		this.env = options.env ?? browserEnv();
		this.onCheckpoint = options.onCheckpoint;
		this.loop = new GameLoop(createWorld(options.home, options.config));
		// Nothing moves until the saved checkpoint (if any) has been applied.
		this.loop.pause("loading");
		this.offLoop = this.loop.subscribe((event) => this.onEvent(event));
	}

	/** Starts the frame driver and background handling. Idempotent. */
	start() {
		if (this.disposed || this.frameId !== undefined) return;
		activeDrivers++;
		this.offVisibility = this.env.onVisibility((hidden) =>
			hidden ? this.loop.pause("background") : this.loop.resume("background"),
		);
		if (this.env.isHidden()) this.loop.pause("background");
		const tick = (now: number) => {
			if (this.disposed) return;
			this.frame(now);
			this.frameId = this.env.requestFrame(tick);
		};
		this.frameId = this.env.requestFrame(tick);
	}

	/** Restores a checkpoint (or keeps home) and lets input move the player. Call once. */
	ready(restore?: LngLat) {
		if (this.disposed) return;
		if (restore) this.loop.dispatch({ type: "teleport", position: restore });
		this.loop.resume("loading");
		this.centerCamera();
	}

	attachCamera(camera: MapCamera | undefined) {
		this.camera = camera;
		this.lastBearing = Number.NaN;
		this.centerCamera();
	}

	get isFollowing() {
		return this.following;
	}

	setFollowing(on: boolean) {
		this.following = on;
		if (on) this.centerCamera();
	}

	/** Exposed for tests: one driver frame. */
	frame(now: number) {
		const { camera, loop } = this;
		if (camera) {
			const bearing = camera.getBearing();
			if (bearing !== this.lastBearing) {
				this.lastBearing = bearing;
				loop.dispatch({ type: "view", bearing });
			}
		}
		loop.frame(now);
		if (this.following) this.centerCamera();
	}

	/** Interpolated render position. Writes into `out`. */
	renderPosition(out: LngLat) {
		return this.loop.interpolated(out);
	}

	/** Disposes everything and writes a final checkpoint (route exit). Idempotent. */
	dispose() {
		if (this.disposed) return;
		const wasReady = !this.loop.pauseReasons.includes("loading");
		this.disposed = true;
		if (this.frameId !== undefined) {
			this.env.cancelFrame(this.frameId);
			this.frameId = undefined;
			activeDrivers--;
		}
		this.offVisibility?.();
		this.offLoop();
		// Do not overwrite a saved checkpoint with "home" if we exit before it was restored.
		if (wasReady) this.onCheckpoint?.({ ...this.loop.world.player.position });
		this.loop.dispose();
		this.camera = undefined;
	}

	private centerCamera() {
		if (!this.camera) return;
		this.camera.jumpTo(this.loop.interpolated(this.scratch));
	}

	private onEvent(event: GameEvent) {
		if (event.type === "paused" && event.reason !== "loading")
			this.onCheckpoint?.({ ...this.loop.world.player.position });
	}
}
