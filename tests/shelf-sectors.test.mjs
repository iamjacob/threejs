import assert from "node:assert/strict";
import { test } from "node:test";
import {
	groupBySector,
	SHELF_SECTORS,
	sectorOf,
} from "../src/components/shelves/shelfSectors.ts";

const radius = 7.4;
const at = (angle) => [
	Math.cos(angle) * radius,
	0,
	-Math.sin(angle) * radius,
];

test("sector index follows the shelf angle and covers the whole ring", () => {
	const seen = new Set();
	for (let i = 0; i < 360; i++) {
		const sector = sectorOf(at((i / 360) * Math.PI * 2));
		assert.ok(sector >= 0 && sector < SHELF_SECTORS);
		seen.add(sector);
	}
	assert.equal(seen.size, SHELF_SECTORS);
	assert.equal(sectorOf(at(0)), 0);
	assert.equal(sectorOf(at(-0.001)), SHELF_SECTORS - 1);
});

test("neighbouring books on a 30 cm shelf land in the same or adjacent sector", () => {
	let previous = sectorOf(at(0));
	for (let angle = 0.02; angle < Math.PI * 2; angle += 0.02) {
		const sector = sectorOf(at(angle));
		const step = (sector - previous + SHELF_SECTORS) % SHELF_SECTORS;
		assert.ok(step === 0 || step === 1, `jumped from ${previous} to ${sector}`);
		previous = sector;
	}
});

test("groupBySector keeps order inside a sector and sorts sectors", () => {
	const entries = [3.5, 0.1, 3.6, 0.2].map((angle, index) => ({
		placement: { position: at(angle), book: { id: `b${index}` } },
	}));
	const groups = groupBySector(entries, 4);
	assert.deepEqual(
		groups.map((group) => group.sector),
		[...groups.map((group) => group.sector)].sort((a, b) => a - b),
	);
	const ids = groups.flatMap((group) =>
		group.items.map((item) => item.placement.book.id),
	);
	assert.equal(new Set(ids).size, 4);
	const first = groups.find((group) => group.sector === 0);
	assert.deepEqual(
		first.items.map((item) => item.placement.book.id),
		["b1", "b3"],
	);
});
