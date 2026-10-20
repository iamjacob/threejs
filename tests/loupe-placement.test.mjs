import assert from "node:assert/strict";
import { test } from "node:test";
import {
	LOUPE_GAP,
	LOUPE_MARGIN,
	placeLoupe,
} from "../src/components/scanner/loupePlacement.ts";

const box = { width: 800, height: 600 };
const inside = (lens) =>
	lens.left >= LOUPE_MARGIN &&
	lens.top >= LOUPE_MARGIN &&
	lens.left + lens.size <= box.width - LOUPE_MARGIN &&
	lens.top + lens.size <= box.height - LOUPE_MARGIN;
const covers = (lens, p) =>
	p.x >= lens.left &&
	p.x <= lens.left + lens.size &&
	p.y >= lens.top &&
	p.y <= lens.top + lens.size;

test("the lens sits right beside the pointer, on the roomier side", () => {
	const left = placeLoupe({ x: 200, y: 300 }, box, 264);
	assert.equal(left.size, 264);
	assert.equal(left.left, 200 + LOUPE_GAP);
	assert.equal(left.top, 300 - 132);
	const right = placeLoupe({ x: 600, y: 300 }, box, 264);
	assert.equal(right.left, 600 - LOUPE_GAP - 264);
});

test("the lens never covers the pointer and never leaves the box", () => {
	for (const x of [0, 40, 260, 400, 540, 760, 800])
		for (const y of [0, 30, 300, 570, 600]) {
			const lens = placeLoupe({ x, y }, box, 264);
			assert.ok(inside(lens), `inside at ${x},${y}`);
			assert.ok(!covers(lens, { x, y }), `clear of pointer at ${x},${y}`);
		}
});

test("a narrow box puts the lens above or below instead of beside", () => {
	const narrow = { width: 300, height: 700 };
	const lens = placeLoupe({ x: 150, y: 500 }, narrow, 264);
	assert.ok(lens.top + lens.size <= 500 - LOUPE_GAP + 0.001);
});

test("the lens shrinks to fit a small crop box", () => {
	const lens = placeLoupe({ x: 100, y: 100 }, { width: 200, height: 200 }, 264);
	assert.ok(lens.size <= 200 - LOUPE_MARGIN * 2);
	assert.ok(lens.size >= 64);
});
