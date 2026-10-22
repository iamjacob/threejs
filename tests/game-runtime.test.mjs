import assert from "node:assert/strict";
import { test } from "node:test";
import { distanceMeters } from "../src/game/core/geo.ts";
import { activeDriverCount, MapPlayRuntime } from "../src/game/runtime/mapRuntime.ts";
import { HOME } from "./game-helpers.mjs";

/** Fake browser: manual rAF queue + visibility, so lifecycle is tested without a DOM. */
function fakeEnv() {
	let nextId = 1;
	const frames = new Map();
	const visibility = new Set();
	let hidden = false;
	return {
		env: {
			requestFrame: (cb) => {
				const id = nextId++;
				frames.set(id, cb);
				return id;
			},
			cancelFrame: (id) => frames.delete(id),
			onVisibility: (cb) => {
				visibility.add(cb);
				return () => visibility.delete(cb);
			},
			isHidden: () => hidden,
		},
		/** Runs all queued frames once at time `now` (like one display refresh). */
		tick(now) {
			const due = [...frames.entries()];
			frames.clear();
			for (const [, cb] of due) cb(now);
		},
		setHidden(next) {
			hidden = next;
			for (const cb of [...visibility]) cb(next);
		},
		get pendingFrames() {
			return frames.size;
		},
		get visibilityListeners() {
			return visibility.size;
		},
	};
}
function camera() {
	const calls = [];
	return { calls, bearing: 0, getBearing() { return this.bearing; }, jumpTo(c) { calls.push({ ...c }); } };
}
const play = (fake, rt, seconds, from = 0, fps = 60) => {
	let t = from;
	for (let i = 0; i <= seconds * fps; i++) fake.tick((t = from + (i * 1000) / fps));
	return t;
};

test("nothing moves before ready(); ready(restore) teleports and enables input", () => {
	const fake = fakeEnv();
	const rt = new MapPlayRuntime({ home: HOME, env: fake.env });
	rt.start();
	rt.loop.dispatch({ type: "steer", x: 0, y: 1 }); // ignored while loading
	play(fake, rt, 1);
	assert.ok(distanceMeters(rt.loop.world.player.position, HOME) < 1e-9);
	const saved = { lng: 9.56, lat: 55.71 };
	rt.ready(saved);
	rt.loop.dispatch({ type: "steer", x: 0, y: 1 });
	play(fake, rt, 1, 2000);
	assert.ok(rt.loop.world.player.position.lat > saved.lat, "moves from the restored point");
	rt.dispose();
});

test("exactly one frame driver per runtime; dispose cancels it (route remount)", () => {
	const fake = fakeEnv();
	const before = activeDriverCount();
	const a = new MapPlayRuntime({ home: HOME, env: fake.env });
	a.start();
	a.start(); // idempotent
	assert.equal(fake.pendingFrames, 1);
	assert.equal(activeDriverCount(), before + 1);
	a.dispose();
	a.dispose();
	assert.equal(fake.pendingFrames, 0, "rAF cancelled");
	assert.equal(fake.visibilityListeners, 0, "listeners removed");
	assert.equal(activeDriverCount(), before);
	const b = new MapPlayRuntime({ home: HOME, env: fake.env });
	b.start();
	b.ready();
	b.loop.dispatch({ type: "steer", x: 0, y: 1 });
	play(fake, b, 1);
	assert.ok(b.loop.world.tick >= 58 && b.loop.world.tick <= 61, `60 steps/s, not doubled (${b.loop.world.tick})`);
	b.dispose();
});

test("backgrounding pauses, saves one checkpoint, and resumes without catch-up", () => {
	const fake = fakeEnv();
	const saves = [];
	const rt = new MapPlayRuntime({ home: HOME, env: fake.env, onCheckpoint: (p) => saves.push(p) });
	rt.start();
	rt.ready();
	rt.loop.dispatch({ type: "steer", x: 0, y: 1 });
	let t = play(fake, rt, 1);
	fake.setHidden(true);
	fake.setHidden(true);
	assert.equal(saves.length, 1, "one checkpoint for one background transition");
	assert.ok(distanceMeters(saves[0], rt.loop.world.player.position) < 1e-9);
	const tick = rt.loop.world.tick;
	t = play(fake, rt, 3, t); // throttled background frames still arrive
	assert.equal(rt.loop.world.tick, tick);
	fake.setHidden(false);
	play(fake, rt, 1, t + 120_000);
	assert.ok(distanceMeters(saves[0], rt.loop.world.player.position) < 1e-9, "no runaway: steering was cleared");
	rt.dispose();
	assert.equal(saves.length, 2, "route exit writes the final checkpoint");
});

test("starting while already hidden starts paused", () => {
	const fake = fakeEnv();
	fake.setHidden(true);
	const rt = new MapPlayRuntime({ home: HOME, env: fake.env });
	rt.start();
	rt.ready();
	assert.ok(rt.loop.paused);
	rt.dispose();
});

test("exit before restore never overwrites the saved checkpoint with home", () => {
	const fake = fakeEnv();
	const saves = [];
	const rt = new MapPlayRuntime({ home: HOME, env: fake.env, onCheckpoint: (p) => saves.push(p) });
	rt.start();
	rt.dispose();
	assert.deepEqual(saves, []);
});

test("camera follows the interpolated player and the map bearing steers input", () => {
	const fake = fakeEnv();
	const cam = camera();
	const rt = new MapPlayRuntime({ home: HOME, env: fake.env });
	rt.attachCamera(cam);
	rt.start();
	rt.ready();
	cam.bearing = 90; // map rotated: screen-up faces east
	rt.loop.dispatch({ type: "steer", x: 0, y: 1 });
	play(fake, rt, 1);
	const last = cam.calls.at(-1);
	const at = rt.renderPosition({ lng: 0, lat: 0 });
	assert.ok(distanceMeters(last, at) < 1e-6, "camera centered on the rendered player");
	assert.ok(rt.loop.world.player.position.lng > HOME.lng && Math.abs(rt.loop.world.player.position.lat - HOME.lat) < 1e-9);
	rt.setFollowing(false);
	const n = cam.calls.length;
	play(fake, rt, 0.5, 2000);
	assert.equal(cam.calls.length, n, "no camera writes while the user pans freely");
	rt.dispose();
});
