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
	assert.equal(t.go("/maps"), true);
	assert.equal(phase(), "cover");
	await clock.run(0);
	assert.deepEqual(calls, [["preload", "/maps"]], "preload starts immediately, navigation waits for the cover");
	await clock.run(300);
	assert.equal(phase(), "wait");
	assert.deepEqual(calls.at(-1), ["navigate", "/maps"]);
	t.arrive("/");
	assert.equal(phase(), "wait", "arrival of the wrong route is ignored");
	t.arrive("/maps");
	assert.equal(phase(), "reveal");
	await clock.run(400);
	assert.equal(phase(), "idle");
	assert.equal(t.store.getState().to, undefined);
});

test("double taps and arrivals outside a transition are ignored", async () => {
	const { t, clock, calls, phase } = setup();
	t.arrive("/maps");
	assert.equal(phase(), "idle");
	assert.equal(t.go("/maps"), true);
	assert.equal(t.go("/"), false, "a second request during a transition is ignored");
	await clock.run(300);
	assert.equal(calls.filter((c) => c[0] === "navigate").length, 1);
});

test("slow destination: after maxWait the overlay stays as 'slow' (no blank reveal); a late arrival still reveals", async () => {
	const { t, clock, phase } = setup();
	t.go("/maps");
	await clock.run(300 + 4999);
	assert.equal(phase(), "wait");
	await clock.run(1);
	assert.equal(phase(), "slow", "an unready scene is never revealed by a timer");
	await clock.run(60_000);
	assert.equal(phase(), "slow", "stays until the scene is ready or the user chooses");
	t.arrive("/");
	assert.equal(phase(), "slow", "arrival of the wrong route is still ignored");
	t.arrive("/maps");
	assert.equal(phase(), "reveal");
	await clock.run(400);
	assert.equal(phase(), "idle");
});

test("slow: 'Keep waiting' re-arms the wait; 'Show anyway' reveals", async () => {
	const { t, clock, phase } = setup();
	t.go("/maps");
	await clock.run(300 + 5000);
	assert.equal(phase(), "slow");
	t.retry();
	assert.equal(phase(), "wait");
	await clock.run(5000);
	assert.equal(phase(), "slow", "waited another maxWait");
	t.dismiss();
	assert.equal(phase(), "reveal");
	await clock.run(400);
	assert.equal(phase(), "idle");
});

test("failed navigate: 'failed' (no reveal); 'Try again' re-navigates; 'Close' reveals", async () => {
	const clock = fakeTimers();
	const t = createSceneTransition({ coverMs: 300, revealMs: 400, maxWaitMs: 5000, timers: clock.timers });
	let attempts = 0;
	t.setNavigator(() => {
		attempts++;
		return attempts === 1 ? Promise.reject(new Error("route failed")) : undefined;
	});
	t.go("/maps");
	await clock.run(300);
	assert.equal(t.store.getState().phase, "failed");
	await clock.run(60_000);
	assert.equal(t.store.getState().phase, "failed", "no timer turns a failure into a reveal");
	t.retry();
	await clock.run(0);
	assert.equal(attempts, 2);
	assert.equal(t.store.getState().phase, "wait");
	t.arrive("/maps");
	assert.equal(t.store.getState().phase, "reveal");

	const b = setup();
	b.t.setNavigator(() => Promise.reject(new Error("offline chunk")));
	b.t.go("/maps");
	await b.clock.run(300);
	assert.equal(b.phase(), "failed");
	b.t.dismiss();
	assert.equal(b.phase(), "reveal");
});

test("cancel (browser Back mid-transition): overlay drops at once; stale timers and late arrivals do nothing", async () => {
	const { t, clock, calls, phase } = setup();
	t.go("/maps");
	t.cancel();
	assert.equal(phase(), "idle", "cancel during cover");
	await clock.run(10_000);
	assert.equal(calls.filter((c) => c[0] === "navigate").length, 0, "the covered navigation never fires");
	assert.equal(phase(), "idle");

	t.go("/maps");
	await clock.run(300);
	assert.equal(phase(), "wait");
	t.cancel();
	assert.equal(phase(), "idle", "cancel during wait");
	t.arrive("/maps");
	await clock.run(10_000);
	assert.equal(phase(), "idle", "a late arrival or timer does not resurrect the overlay");
	assert.equal(t.go("/"), true, "a new transition can start right away");
});

test("retry/dismiss outside slow/failed are no-ops (repeated taps cannot corrupt state)", async () => {
	const { t, clock, phase } = setup();
	t.retry();
	t.dismiss();
	t.cancel();
	assert.equal(phase(), "idle");
	t.go("/maps");
	t.retry();
	t.dismiss();
	assert.equal(phase(), "cover");
	await clock.run(300);
	t.dismiss();
	assert.equal(phase(), "wait", "cannot skip readiness while it is still loading normally");
});

test("no navigator registered: go() refuses instead of covering the screen forever", () => {
	const t = createSceneTransition({ timers: fakeTimers().timers });
	assert.equal(t.go("/maps"), false);
	assert.equal(t.store.getState().phase, "idle");
	const off = t.setNavigator(() => {});
	off();
	assert.equal(t.go("/maps"), false);
});

test("back and forth: consecutive transitions each complete; ids increase", async () => {
	const { t, clock, calls, phase } = setup();
	for (const to of ["/maps", "/", "/maps"]) {
		const before = t.store.getState().id;
		assert.equal(t.go(to), true);
		await clock.run(300);
		t.arrive(to);
		await clock.run(400);
		assert.equal(phase(), "idle");
		assert.equal(t.store.getState().id, before + 1);
	}
	assert.deepEqual(calls.filter((c) => c[0] === "navigate").map((c) => c[1]), ["/maps", "/", "/maps"]);
});
