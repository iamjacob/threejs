import assert from "node:assert/strict";
import { test } from "node:test";
import { loadShelfPlates, normalizeShelfPlates, useShelfPlatesStore } from "../src/stores/useShelfPlatesStore.ts";

test("plate names persist in shelf order and clearing removes a plate", (t) => {
	const values = new Map();
	const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
	Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
		getItem: key => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
	} });
	t.after(() => {
		if (original) Object.defineProperty(globalThis, "localStorage", original);
		else delete globalThis.localStorage;
	});
	const store = useShelfPlatesStore;
	store.getState().openEditor();
	store.getState().save(["Fiction", "", "Business", " Stoics & seekers "]);
	assert.deepEqual(loadShelfPlates(), ["Fiction", "", "Business", "Stoics & seekers"]);
	assert.equal(store.getState().editorOpen, false);
	store.getState().save(["Fiction", "", "Business", ""]);
	assert.equal(loadShelfPlates()[3], "");
	values.set("boooks-shelf-plates-v1", "broken json");
	assert.deepEqual(loadShelfPlates(), ["", "", "", ""]);
});

test("plate data is bounded and invalid stored values are ignored", () => {
	assert.deepEqual(normalizeShelfPlates({}), ["", "", "", ""]);
	assert.deepEqual(normalizeShelfPlates([123, null, "x".repeat(80), "name", "extra"]), ["", "", "x".repeat(36), "name"]);
});
