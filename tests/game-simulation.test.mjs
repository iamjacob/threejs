import assert from "node:assert/strict";
import { test } from "node:test";
import { distanceMeters } from "../src/game/core/geo.ts";
import { HOME, newLoop, offset, run } from "./game-helpers.mjs";

test("steer command moves the player north at top speed (bearing 0)", () => {
	const { loop, events } = newLoop();
	loop.dispatch({ type: "steer", x: 0, y: 1 });
	run(loop, 3, 60);
	const [east, north] = offset(loop);
	assert.ok(Math.abs(east) < 1e-6, `no sideways drift (${east})`);
	// Discrete model: v_i = vmax·(1 − r^i), r = e^(−response·dt); distance = Σ v_i·dt over 180 steps.
	const { maxSpeed, response, fixedDt } = loop.world.config;
	const r = Math.exp(-response * fixedDt);
	let expected = 0;
	for (let i = 1; i <= 180; i++) expected += maxSpeed * (1 - r ** i) * fixedDt;
	assert.ok(Math.abs(north - expected) < 0.01, `north ≈ ${expected.toFixed(3)} m, got ${north}`);
	assert.deepEqual(events, ["moving-started"]);
	assert.equal(loop.world.tick, 180);
});

test("same outcome at 60, 30 and 144 fps and with irregular frames (fixed timestep)", () => {
	const finals = [60, 30, 144].map((fps) => {
		const { loop } = newLoop();
		loop.dispatch({ type: "steer", x: 0.6, y: 0.8 });
		run(loop, 2, fps);
		return { tick: loop.world.tick, pos: { ...loop.world.player.position } };
	});
	for (const f of finals) {
		assert.equal(f.tick, finals[0].tick, "same number of steps");
		assert.ok(distanceMeters(f.pos, finals[0].pos) < 1e-6, "same position");
	}
	const { loop } = newLoop();
	loop.dispatch({ type: "steer", x: 0.6, y: 0.8 });
	const jitter = [7, 23, 16, 41, 3, 16.7, 33];
	let t = 0;
	loop.frame(t);
	for (let i = 0; t < 2000; i++) {
		t = Math.min(2000, t + jitter[i % jitter.length]);
		loop.frame(t);
	}
	assert.equal(loop.world.tick, finals[0].tick);
	assert.ok(distanceMeters(loop.world.player.position, finals[0].pos) < 1e-6);
});

test("throttled 4 fps gives the same outcome; long gaps are dropped, not replayed", () => {
	const ref = newLoop();
	ref.loop.dispatch({ type: "steer", x: 1, y: 0 });
	run(ref.loop, 2, 60);
	const slow = newLoop();
	slow.loop.dispatch({ type: "steer", x: 1, y: 0 });
	run(slow.loop, 2, 4); // 250 ms frames == maxFrameDt, so nothing is dropped
	assert.equal(slow.loop.world.tick, ref.loop.world.tick);
	assert.ok(distanceMeters(slow.loop.world.player.position, ref.loop.world.player.position) < 1e-6);

	const gap = newLoop();
	gap.loop.dispatch({ type: "steer", x: 1, y: 0 });
	gap.loop.frame(0);
	gap.loop.frame(10_000); // 10 s hitch with no visibility event
	assert.equal(gap.loop.world.tick, 15, "only maxFrameDt (0.25 s) was simulated");
});

test("bearing: stick 'up' follows the screen when the map is rotated", () => {
	const { loop } = newLoop();
	loop.dispatch({ type: "view", bearing: 90 });
	loop.dispatch({ type: "steer", x: 0, y: 1 });
	run(loop, 1, 60);
	const [east, north] = offset(loop);
	assert.ok(east > 25 && Math.abs(north) < 1e-6, `moved east (${east}, ${north})`);
});

test("release stops the player and emits exactly one moving-stopped", () => {
	const { loop, events } = newLoop();
	loop.dispatch({ type: "steer", x: 0, y: 1 });
	run(loop, 1, 60);
	loop.dispatch({ type: "steer", x: 0, y: 0 });
	const t = run(loop, 2, 60, 1000);
	const before = { ...loop.world.player.position };
	run(loop, 1, 60, t);
	assert.ok(distanceMeters(before, loop.world.player.position) < 1e-6, "at rest");
	assert.deepEqual(events, ["moving-started", "moving-stopped"]);
});

test("oversized steer is clamped to top speed; NaN/Infinity is ignored", () => {
	const { loop } = newLoop();
	loop.dispatch({ type: "steer", x: 10, y: 0 });
	run(loop, 5, 60);
	const speed = Math.hypot(loop.world.player.velocityEast, loop.world.player.velocityNorth);
	assert.ok(speed <= loop.world.config.maxSpeed + 1e-9, `speed capped (${speed})`);
	loop.dispatch({ type: "steer", x: Number.NaN, y: Number.POSITIVE_INFINITY });
	assert.equal(loop.world.intentX, 0);
	assert.equal(loop.world.intentY, 0);
});

test("play-area boundary holds the player and emits one boundary event", () => {
	const { loop, events } = newLoop({ maxDistance: 100 });
	loop.dispatch({ type: "steer", x: 0, y: 1 });
	run(loop, 10, 60);
	const [, north] = offset(loop);
	assert.ok(Math.abs(north - 100) < 0.01, `clamped at the edge (${north})`);
	assert.equal(events.filter((e) => e === "boundary-reached").length, 1);
});

test("interpolated render position lies between the last two steps", () => {
	const { loop } = newLoop();
	loop.dispatch({ type: "steer", x: 0, y: 1 });
	run(loop, 1, 60);
	loop.advance(0.5 / 60);
	const out = loop.interpolated({ lng: 0, lat: 0 });
	assert.ok(out.lat < loop.world.player.position.lat && out.lat > HOME.lat);
});
