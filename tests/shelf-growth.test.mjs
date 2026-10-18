import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
	arrangedBookPose,
	arrangeShelfBooks,
	BASE_SHELF_FRACTION,
	pictureFrameSlot,
	SHELF_RADIUS,
	shelfArcFraction,
	shelfRowWidths,
	shelfSlotPose,
} from "../src/components/shelves/shelfArrangement.ts";
import { getShelfBooks } from "../src/components/shelves/shelfBooks.ts";
import { createShelfDocument } from "../src/lib/shelfModel.ts";

const books = getShelfBooks(
	JSON.parse(
		readFileSync(new URL("../public/books.json", import.meta.url), "utf8"),
	),
);
const document = createShelfDocument(books);
const circumference = SHELF_RADIUS * Math.PI * 2;

test("the default library fits the level 4 arc, so the shelf does not grow", () => {
	const widths = shelfRowWidths(books, document);
	assert.equal(widths.length, 4);
	assert.ok(Math.max(...widths) < circumference * BASE_SHELF_FRACTION);
	assert.equal(shelfArcFraction(books, document), BASE_SHELF_FRACTION);
});

test("a crowded row widens the arc just enough and never past a full circle", () => {
	// Put every book on one shelf, cover out.
	const crowded = {
		...document,
		items: Object.fromEntries(
			books.map((book) => [
				book.id,
				{ shelf: 1, layout: "upright", angle: 0, face: "cover" },
			]),
		),
		stacks: [],
	};
	const widest = Math.max(...shelfRowWidths(books, crowded));
	const fraction = shelfArcFraction(books, crowded);
	assert.ok(fraction > BASE_SHELF_FRACTION);
	assert.ok(fraction <= 1);
	// The arc covers the row plus one gap at each end.
	assert.ok(
		Math.abs(fraction * circumference - (widest + crowded.spacing * 2)) < 1e-9,
	);
	// Every book stays on the shelf radius and no two overlap along the arc.
	const row = arrangeShelfBooks(books, crowded, fraction)
		.map((entry) => ({
			angle: Math.atan2(entry.position[2], entry.position[0]),
			width: entry.book.dimensions[0],
			radius: Math.hypot(entry.position[0], entry.position[2]),
		}))
		.sort((a, b) => a.angle - b.angle);
	for (const entry of row) assert.ok(Math.abs(entry.radius - SHELF_RADIUS) < 1e-9);
	for (let i = 1; i < row.length; i++) {
		const gap = (row[i].angle - row[i - 1].angle) * SHELF_RADIUS;
		assert.ok(gap + 1e-9 >= (row[i].width + row[i - 1].width) / 2 + crowded.spacing);
	}
	// Extra width (a picture frame) grows it further.
	assert.ok(shelfArcFraction(books, crowded, BASE_SHELF_FRACTION, 0.5) > fraction);
	// Level 10 stays a full circle.
	assert.equal(shelfArcFraction(books, { ...crowded, fullCircle: true }), 1);
	assert.equal(shelfArcFraction(books, crowded, 1), 1);
});

test("the picture frame stands upright on the emptiest shelf, after the last book", () => {
	const frameWidth = 0.45;
	const fraction = shelfArcFraction(books, document, BASE_SHELF_FRACTION, frameWidth);
	const slot = pictureFrameSlot(books, document, fraction, frameWidth);
	const widths = shelfRowWidths(books, document);
	assert.equal(widths[slot.shelf], Math.min(...widths));
	const placements = arrangeShelfBooks(books, document, fraction).filter(
		(entry) => entry.shelfIndex === slot.shelf,
	);
	const lastBookAngle = Math.min(
		...placements.map((entry) => Math.atan2(-entry.position[2], entry.position[0])),
	);
	// The frame sits past the last book by at least half a book, the gap and half the frame.
	assert.ok(slot.angle < lastBookAngle);
	const pose = shelfSlotPose(slot.shelf, slot.angle, 0.6);
	assert.ok(Math.abs(Math.hypot(pose.position[0], pose.position[2]) - SHELF_RADIUS) < 1e-9);
	// Same orientation rule as an upright, cover-out book at that angle.
	const bookLike = arrangedBookPose({
		book: books[0],
		shelfIndex: slot.shelf,
		position: pose.position,
		rotation: pose.rotation,
		scale: 1,
	});
	const bookPose = arrangedBookPose(
		arrangeShelfBooks(books, document, fraction).find(
			(entry) => entry.shelfIndex === slot.shelf,
		),
	);
	// Both face outward (+z in world after the parent's 90° turn): the facing
	// vector's dot with the outward radial direction is positive for each.
	const outward = (position) => {
		const radial = [position[0], 0, position[2]];
		const length = Math.hypot(radial[0], radial[2]);
		return [radial[0] / length, 0, radial[2] / length];
	};
	const facing = (quaternion) => {
		const [x, y, z, w] = quaternion;
		// Rotate (0,0,1) by the quaternion.
		return [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
	};
	for (const candidate of [bookLike, bookPose]) {
		const f = facing(candidate.quaternion);
		const o = outward(candidate.position);
		assert.ok(f[0] * -o[0] + f[2] * -o[2] > 0.9, "faces the room, not the wall");
	}
});
