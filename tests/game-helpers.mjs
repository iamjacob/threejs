// Shared helpers for headless game-engine tests (no WebGL, React, SQLite or Capacitor).
import { metersBetween } from "../src/game/core/geo.ts";
import { GameLoop } from "../src/game/core/loop.ts";
import { createWorld } from "../src/game/core/simulation.ts";

export const HOME = { lng: 9.55368, lat: 55.707813 };

export function newLoop(config) {
	const loop = new GameLoop(createWorld(HOME, config));
	const events = [];
	loop.subscribe((e) => events.push(e.type));
	return { loop, events };
}

/** Drives the loop like requestAnimationFrame at `fps` for `seconds` of wall time. */
export function run(loop, seconds, fps, start = 0) {
	const frames = Math.round(seconds * fps);
	let t = start;
	loop.frame(t);
	for (let i = 0; i < frames; i++) {
		t += 1000 / fps;
		loop.frame(t);
	}
	return t;
}

/** [east, north] meters of the player from HOME. */
export const offset = (loop) =>
	metersBetween(HOME, loop.world.player.position, [0, 0]);
