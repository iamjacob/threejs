import assert from "node:assert/strict";
import { test } from "node:test";
import { atlasUvTransform, packAtlas } from "../src/lib/atlasPacking.ts";

function overlaps(a, b) {
	return (
		a.x < b.x + b.width &&
		b.x < a.x + a.width &&
		a.y < b.y + b.height &&
		b.y < a.y + a.height
	);
}

test("packs covers into the smallest power-of-two square without overlap", () => {
	const inputs = Array.from({ length: 53 }, (_, i) => ({
		id: `cover-${i}`,
		width: 120 + (i % 7) * 20,
		height: 256 + (i % 5) * 32,
	}));
	const { size, regions } = packAtlas(inputs, { padding: 2 });
	assert.equal(regions.length, inputs.length);
	assert.equal(Math.log2(size) % 1, 0);
	assert.ok(size <= 2048, `expected <= 2048, got ${size}`);
	for (const region of regions) {
		assert.ok(region.x >= 2 && region.y >= 2);
		assert.ok(region.x + region.width + 2 <= size);
		assert.ok(region.y + region.height + 2 <= size);
	}
	for (let i = 0; i < regions.length; i++) {
		for (let j = i + 1; j < regions.length; j++) {
			assert.ok(
				!overlaps(regions[i], regions[j]),
				`${regions[i].id} overlaps ${regions[j].id}`,
			);
		}
	}
});

test("is deterministic and keeps every id once", () => {
	const inputs = [
		{ id: "b", width: 100, height: 200 },
		{ id: "a", width: 100, height: 200 },
		{ id: "c", width: 50, height: 300 },
	];
	const first = packAtlas(inputs);
	const second = packAtlas([...inputs].reverse());
	assert.deepEqual(first, second);
	assert.deepEqual(
		first.regions.map((r) => r.id).sort(),
		["a", "b", "c"],
	);
});

test("fails loudly when covers cannot fit the maximum size", () => {
	assert.throws(
		() => packAtlas([{ id: "huge", width: 5000, height: 10 }], { maxSize: 4096 }),
		/do not fit/,
	);
});

test("uv transform maps a region to offset/repeat with flipped Y", () => {
	const uv = atlasUvTransform({ id: "x", x: 256, y: 0, width: 256, height: 512 }, 1024);
	assert.deepEqual(uv.repeat, [0.25, 0.5]);
	assert.deepEqual(uv.offset, [0.25, 0.5]);
});
