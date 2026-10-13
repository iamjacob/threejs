import assert from "node:assert/strict";
import { test } from "node:test";
import { BOOK_HOLD_MS, createBookLongPress } from "../src/lib/bookLongPress.ts";

const pointer = {
	pointerId: 1,
	clientX: 100,
	clientY: 200,
	button: 0,
	isPrimary: true,
};

test("a short tap never enters editing and remains available to the normal click handler", (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let edits = 0;
	const press = createBookLongPress(() => edits++);
	press.start(pointer);
	t.mock.timers.tick(BOOK_HOLD_MS - 1);
	press.end(pointer);
	t.mock.timers.tick(1000);
	assert.equal(edits, 0);
	assert.equal(press.consumeClick(), false);
});

test("holding opens the editor exactly once and suppresses the click after release", (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let edits = 0;
	const press = createBookLongPress(() => edits++);
	press.start(pointer);
	t.mock.timers.tick(BOOK_HOLD_MS);
	assert.equal(edits, 1);
	t.mock.timers.tick(2000);
	press.end(pointer);
	assert.equal(edits, 1);
	assert.equal(press.consumeClick(), true);
	assert.equal(press.consumeClick(), false);
	press.start(pointer);
	press.end(pointer);
	assert.equal(press.consumeClick(), false);
});

test("orbit dragging cancels a hold even when the pointer leaves the original mesh", (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let edits = 0;
	const press = createBookLongPress(() => edits++);
	press.start(pointer);
	press.move({ ...pointer, clientX: 109 });
	t.mock.timers.tick(1000);
	assert.equal(edits, 0);
});

test("small finger jitter is tolerated without canceling an intentional hold", (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let edits = 0;
	const press = createBookLongPress(() => edits++);
	press.start(pointer);
	press.move({ ...pointer, clientX: 104, clientY: 204 });
	t.mock.timers.tick(BOOK_HOLD_MS);
	assert.equal(edits, 1);
});

test("pinching, cancellation, and leaving the page do not accidentally edit a book", (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let edits = 0;
	const press = createBookLongPress(() => edits++);
	press.start(pointer);
	press.additionalPointer({ pointerId: 2 });
	t.mock.timers.tick(1000);
	press.start(pointer);
	press.cancel();
	t.mock.timers.tick(1000);
	press.start(pointer);
	press.end(pointer);
	t.mock.timers.tick(1000);
	assert.equal(edits, 0);
});

test("right clicks and secondary touches cannot start editing", (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let edits = 0;
	const press = createBookLongPress(() => edits++);
	press.start({ ...pointer, button: 2 });
	t.mock.timers.tick(1000);
	press.start({ ...pointer, isPrimary: false });
	t.mock.timers.tick(1000);
	assert.equal(edits, 0);
});
