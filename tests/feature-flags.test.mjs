import assert from "node:assert/strict";
import { test } from "node:test";

test("every feature flag updates live, persists, reloads, and resets", async (t) => {
	const saved = new Map();
	const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
	Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
		getItem: key => saved.get(key) ?? null,
		setItem: (key, value) => saved.set(key, value),
	} });
	t.after(() => { if (original) Object.defineProperty(globalThis, "localStorage", original); else delete globalThis.localStorage; });
	const { useFeatureFlags: store, featureDefaults } = await import("../src/lib/featureFlags.ts?test=initial");
	const changes = [];
	const unsubscribe = store.subscribe(state => changes.push(state));
	for (const flag of Object.keys(featureDefaults)) store.getState().setFlag(flag, !featureDefaults[flag]);
	assert.equal(changes.length, 3);
	const { useFeatureFlags: reloaded } = await import("../src/lib/featureFlags.ts?test=reload");
	for (const flag of Object.keys(featureDefaults)) assert.equal(reloaded.getState()[flag], !featureDefaults[flag]);
	reloaded.getState().reset();
	const { useFeatureFlags: reset } = await import("../src/lib/featureFlags.ts?test=reset");
	for (const flag of Object.keys(featureDefaults)) assert.equal(reset.getState()[flag], featureDefaults[flag]);
	saved.set("boooks-feature-flags-v1", '{"SHOW_DEMO_UI":"true","SHOW_HELIX_NAV":true,"unknown":true,"SHOW_PICTURE_FRAME":false}');
	const { useFeatureFlags: validated } = await import("../src/lib/featureFlags.ts?test=validate");
	assert.equal(validated.getState().SHOW_DEMO_UI, featureDefaults.SHOW_DEMO_UI);
	assert.equal(validated.getState().SHOW_HELIX_NAV, true);
	assert.equal(validated.getState().unknown, undefined);
	assert.equal(validated.getState().SHOW_PICTURE_FRAME, undefined);
	unsubscribe();
});
