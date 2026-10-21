import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("tucks narrow spines and local covers into leftover row gaps without growing the atlas", () => {
	// Seven 260x384 covers leave a ~220px gap at the right edge of row 1 in a 2048 atlas;
	// narrow spines should fill that gap instead of forcing a new row.
	const covers = Array.from({ length: 7 }, (_, i) => ({
		id: `cover-${i}`,
		width: 260,
		height: 384,
	}));
	const spines = [
		{ id: "spine-a", width: 100, height: 384 },
		{ id: "spine-b", width: 90, height: 384 },
	];
	const { regions } = packAtlas([...covers, ...spines], {
		padding: 2,
		maxSize: 2048,
	});
	for (const region of regions) {
		assert.equal(
			region.y,
			2,
			`expected ${region.id} to pack into row y=2, got y=${region.y}`,
		);
	}
});

test("packs all catalog covers plus local scanned books into one unified atlas", async () => {
	const manifest = JSON.parse(
		await readFile(new URL("../src/lib/coverAtlas.json", import.meta.url), "utf8"),
	);
	const catalogInputs = Object.entries(manifest.regions).map(([id, region]) => ({
		id,
		width: region.width,
		height: region.height,
	}));
	const localInputs = [
		{ id: "data:image/webp;base64,local-front", width: 256, height: 384 },
		{ id: "data:image/webp;base64,local-back", width: 256, height: 384 },
		{ id: "data:image/webp;base64,local-spine", width: 42, height: 384 },
	];
	const { size, regions } = packAtlas([...catalogInputs, ...localInputs], {
		padding: 2,
		maxSize: 4096,
	});
	assert.equal(regions.length, catalogInputs.length + localInputs.length);
	// Thanks to gap packing, a full scanned book (front + back + spine) fits inside the 2048² atlas alongside all 53 catalog textures.
	assert.equal(size, 2048);
	for (let i = 0; i < regions.length; i++) {
		for (let j = i + 1; j < regions.length; j++) {
			assert.ok(
				!overlaps(regions[i], regions[j]),
				`${regions[i].id} overlaps ${regions[j].id}`,
			);
		}
	}
});


