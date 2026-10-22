import assert from "node:assert/strict";
import { test } from "node:test";

const { createSceneTransition } = await import("../src/stores/sceneTransition.ts");

/** Manual clock: run(ms) fires due timers in order. */
function fakeTimers() {
	let now = 0;
	let seq = 0;
	const due = new Map();
	return {
		timers: {
			set: (fn, ms) => {
				const h = ++seq;
				due.set(h, { at: now + ms, fn });
				return h;
			},
			clear: (h) => due.delete(h),
		},
		async run(ms) {
			const end = now + ms;
			for (;;) {
				const next = [...due.entries()].sort((a, b) => a[1].at - b[1].at)[0];
				if (!next || next[1].at > end) break;
				due.delete(next[0]);
				now = next[1].at;
				next[1].fn();
				await new Promise((r) => setImmediate(r)); // let navigate promises settle
			}
			now = end;
		},
	};
}

function setup(opts = {}) {
	const clock = fakeTimers();
	const t = createSceneTransition({ coverMs: 300, revealMs: 400, maxWaitMs: 5000, timers: clock.timers, ...opts });
	const calls = [];
	t.setNavigator(
		(to) => calls.push(["navigate", to]),
		(to) => calls.push(["preload", to]),
	);
	const phase = () => t.store.getState().phase;
	return { t, clock, calls, phase };
}

test("cover → navigate after the cover → wait → arrive → reveal → idle", async () => {
	const { t, clock, calls, phase } = setup();
	assert.equal(t.go("/play"), true);
	assert.equal(phase(), "cover");
	await clock.run(0);
	assert.deepEqual(calls, [["preload", "/play"]], "preload starts immediately, navigation waits for the cover");
	await clock.run(300);
	assert.equal(phase(), "wait");
	assert.deepEqual(calls.at(-1), ["navigate", "/play"]);
	t.arrive("/");
	assert.equal(phase(), "wait", "arrival of the wrong route is ignored");
	t.arrive("/play");
	assert.equal(phase(), "reveal");
	await clock.run(400);
	assert.equal(phase(), "idle");
	assert.equal(t.store.getState().to, undefined);
});

test("double taps and arrivals outside a transition are ignored", async () => {
	const { t, clock, calls, phase } = setup();
	t.arrive("/play");
	assert.equal(phase(), "idle");
	assert.equal(t.go("/play"), true);
	assert.equal(t.go("/"), false, "a second request during a transition is ignored");
	await clock.run(300);
	assert.equal(calls.filter((c) => c[0] === "navigate").length, 1);
});

test("a destination that never arrives is revealed after maxWait; a failed navigate reveals at once", async () => {
	const a = setup();
	a.t.go("/");
	await a.clock.run(300 + 4999);
	assert.equal(a.phase(), "wait");
	await a.clock.run(1);
	assert.equal(a.phase(), "reveal", "never stuck behind the overlay");

	const clock = fakeTimers();
	const b = createSceneTransition({ coverMs: 300, revealMs: 400, maxWaitMs: 5000, timers: clock.timers });
	b.setNavigator(() => Promise.reject(new Error("route failed")));
	b.go("/play");
	await clock.run(300);
	assert.equal(b.store.getState().phase, "reveal");
});

test("no navigator registered: go() refuses instead of covering the screen forever", () => {
	const t = createSceneTransition({ timers: fakeTimers().timers });
	assert.equal(t.go("/play"), false);
	assert.equal(t.store.getState().phase, "idle");
	const off = t.setNavigator(() => {});
	off();
	assert.equal(t.go("/play"), false);
});

test("back and forth: consecutive transitions each complete; ids increase", async () => {
	const { t, clock, calls, phase } = setup();
	for (const to of ["/play", "/", "/play"]) {
		const before = t.store.getState().id;
		assert.equal(t.go(to), true);
		await clock.run(300);
		t.arrive(to);
		await clock.run(400);
		assert.equal(phase(), "idle");
		assert.equal(t.store.getState().id, before + 1);
	}
	assert.deepEqual(calls.filter((c) => c[0] === "navigate").map((c) => c[1]), ["/play", "/", "/play"]);
});
