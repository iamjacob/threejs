import assert from "node:assert/strict";
import { test } from "node:test";
import { createHelixNavigation, helixBooks, helixBookPose } from "../src/lib/helixNavigation.ts";

test("the navigator follows shelf order, includes new scans, and excludes missing or deleted books", () => {
	const books = [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "scan-new", title: "My book" }];
	assert.deepEqual(helixBooks(books, ["b", "a", "a", "missing", "scan-new"], ["a"]), [books[1], books[2]]);
});

test("tapping a visible cover chooses that book and smoothly brings it to the center", () => {
	const chosen = [];
	const nav = createHelixNavigation(12, 3, index => chosen.push(index));
	nav.begin(100, 0);
	nav.end(96, 100);
	assert.deepEqual(chosen, [5]);
	assert.equal(nav.state.position, 3);
	for (let frame = 0; frame < 120; frame++) nav.tick(1 / 60);
	assert.equal(nav.state.position, 5);
	assert.equal(nav.tick(1 / 60), false, "an idle helix stops requesting frames");
});

test("dragging waits until release before committing a book and clamps flicks at either end", () => {
	const chosen = [];
	const nav = createHelixNavigation(8, 3, index => chosen.push(index));
	nav.begin(200, 0);
	nav.move(104, 50);
	assert.deepEqual(chosen, []);
	assert.equal(nav.state.position, 5);
	nav.end(0, 60);
	assert.ok(chosen[0] >= 5 && chosen[0] <= 7);
	nav.begin(0, 100);
	nav.move(10000, 120);
	nav.end(0, 140);
	assert.equal(chosen.at(-1), 0);
});

test("a canceled gesture returns to the last selection without selecting a new book", () => {
	const chosen = [];
	const nav = createHelixNavigation(8, 2, index => chosen.push(index));
	nav.begin(200, 0);
	nav.move(100, 40);
	nav.cancel();
	for (let frame = 0; frame < 120; frame++) nav.tick(1 / 60);
	assert.equal(nav.state.position, 2);
	assert.deepEqual(chosen, []);
});

test("wheel motion settles to one real book, and external scene selection stays in sync", () => {
	const chosen = [];
	const nav = createHelixNavigation(10, 0, index => chosen.push(index));
	nav.scroll(170);
	assert.deepEqual(chosen, []);
	nav.settle();
	assert.deepEqual(chosen, [2]);
	nav.sync(6);
	assert.equal(nav.state.target, 6);
	assert.deepEqual(chosen, [2], "store updates cannot cause a navigation loop");
});

test("keyboard navigation reaches every book and zoom never changes the selection", () => {
	const chosen = [];
	const nav = createHelixNavigation(5, 0, index => chosen.push(index));
	nav.key("ArrowRight"); nav.key("End"); nav.key("ArrowRight"); nav.key("Home");
	assert.deepEqual(chosen, [1, 4, 4, 0]);
	nav.zoom(10000);
	assert.equal(nav.state.spacing, 84);
	nav.zoom(0.00001);
	assert.equal(nav.state.spacing, 28);
	assert.equal(nav.state.selected, 0);
	nav.key("Enter");
	assert.deepEqual(chosen, [1, 4, 4, 0, 0], "Enter activates the centered book even before navigating");
	assert.equal(nav.key("Tab"), false);
});

test("empty and one-book libraries have finite navigation and reduced motion snaps immediately", () => {
	const chosen = [];
	const empty = createHelixNavigation(0, 0, index => chosen.push(index));
	empty.key("End"); empty.scroll(100); empty.settle();
	assert.deepEqual(chosen, []);
	assert.equal(empty.state.position, 0);
	const single = createHelixNavigation(1, 5, index => chosen.push(index));
	single.key("ArrowRight");
	assert.deepEqual(chosen, [0]);
	const reduced = createHelixNavigation(20, 0, () => {}, true);
	reduced.choose(15); reduced.tick(1 / 60);
	assert.equal(reduced.state.position, 15);
});

test("the chosen cover is centered and promoted in depth; all layouts remain finite", () => {
	for (const spacing of [28, 48, 84]) {
		for (let index = 0; index < 30; index++) {
			const centered = helixBookPose(index, index, spacing);
			const neighbor = helixBookPose(index, index + 1, spacing);
			assert.equal(centered.x, 0);
			assert.ok(centered.z > neighbor.z);
			assert.ok(centered.scale > neighbor.scale);
			assert.ok(Object.values(centered).every(Number.isFinite));
		}
	}
});
