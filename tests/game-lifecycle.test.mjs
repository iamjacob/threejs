import assert from "node:assert/strict";
import { test } from "node:test";
import { distanceMeters } from "../src/game/core/geo.ts";
import { HOME, newLoop, run } from "./game-helpers.mjs";

test("pause stops movement now; steering while paused is ignored; no catch-up on resume", () => {
	const { loop, events } = newLoop();
	loop.dispatch({ type: "steer", x: 0, y: 1 });
	let t = run(loop, 1, 60);
	loop.pause("user");
	const at = { ...loop.world.player.position };
	const tick = loop.world.tick;
	loop.dispatch({ type: "steer", x: 1, y: 0 }); // ignored
	t = run(loop, 5, 60, t); // rAF keeps firing while paused
	assert.equal(loop.world.tick, tick, "no steps while paused");
	assert.ok(distanceMeters(at, loop.world.player.position) < 1e-9);

	loop.resume("user");
	loop.frame(t + 60_000); // first frame after resume only sets the baseline
	assert.equal(loop.world.tick, tick, "the paused minute is not replayed");
	run(loop, 1, 60, t + 60_000);
	assert.ok(distanceMeters(at, loop.world.player.position) < 1e-9, "pause cleared intent: no runaway");
	assert.deepEqual(events, ["moving-started", "moving-stopped", "paused", "resumed"]);
});

test("overlapping pause reasons resume only when all clear; duplicates are no-ops", () => {
	const { loop, events } = newLoop();
	loop.pause("background");
	loop.pause("background");
	loop.pause("user");
	loop.resume("background");
	assert.equal(loop.paused, true, "still paused by user");
	loop.resume("background");
	loop.resume("user");
	loop.resume("user");
	assert.equal(loop.paused, false);
	assert.deepEqual(events, ["paused", "resumed"], "one pair, no duplicates");
});

test("background → resume repeated 50× does not accumulate timers, steps or events", () => {
	const { loop, events } = newLoop();
	let t = 0;
	for (let i = 0; i < 50; i++) {
		t = run(loop, 0.1, 60, t);
		loop.pause("background");
		t += 30_000;
		loop.resume("background");
	}
	assert.equal(events.filter((e) => e === "paused").length, 50);
	assert.equal(events.filter((e) => e === "resumed").length, 50);
	// 50 × 0.1 s of foreground time at 60 fps = 300 steps, minus the frame lost after each resume.
	assert.ok(loop.world.tick <= 300 && loop.world.tick >= 250, `bounded steps (${loop.world.tick})`);
});

test("route remount: disposed loop is inert; new loop restores without extra events", () => {
	const first = newLoop();
	first.loop.dispatch({ type: "steer", x: 0, y: 1 });
	run(first.loop, 1, 60);
	first.loop.dispose();
	const tick = first.loop.world.tick;
	first.loop.dispatch({ type: "steer", x: 1, y: 0 });
	first.loop.pause("user");
	run(first.loop, 2, 60, 5000);
	assert.equal(first.loop.world.tick, tick, "disposed loop is inert");
	assert.equal(first.loop.paused, false, "disposed loop ignores pause");

	const second = newLoop();
	second.loop.dispatch({ type: "teleport", position: first.loop.world.player.position });
	run(second.loop, 1, 60);
	assert.ok(distanceMeters(second.loop.world.player.position, first.loop.world.player.position) < 1e-9);
	assert.deepEqual(second.events, [], "no movement events after a restore");
});

test("teleport while moving stops cleanly and emits moving-stopped once", () => {
	const { loop, events } = newLoop();
	loop.dispatch({ type: "steer", x: 0, y: 1 });
	run(loop, 1, 60);
	loop.dispatch({ type: "teleport", position: HOME });
	assert.equal(loop.world.player.velocityNorth, 0);
	assert.deepEqual(events, ["moving-started", "moving-stopped"]);
});

test("a listener that unsubscribes stops receiving events", () => {
	const { loop } = newLoop();
	const got = [];
	const off = loop.subscribe((e) => got.push(e.type));
	loop.pause("user");
	off();
	loop.resume("user");
	assert.deepEqual(got, ["paused"]);
});
