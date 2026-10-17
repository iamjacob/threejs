import assert from "node:assert/strict";
import { test } from "node:test";
import { detectCorners } from "../src/components/scanner/cornerDetector.ts";

// Synthetic photographs with known geometry exercise actual pixel detection,
// including perspective, cover artwork, contrast, and sensor noise.
function photo(points, { width = 320, height = 400, background = 35, cover = 210, noise = 0, artwork = false } = {}) {
	const data = new Uint8ClampedArray(width * height * 4);
	let seed = 1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const inside = points?.every((p, i) => {
				const next = points[(i + 1) % points.length];
				return (next.x - p.x) * (y - p.y) - (next.y - p.y) * (x - p.x) >= 0;
			});
			seed = (1664525 * seed + 1013904223) >>> 0;
			let value = inside ? cover : background;
			if (inside && artwork && x > 100 && x < 220 && y > 120 && y < 260) value = (y % 22 < 7) ? 25 : 150;
			value += (seed / 0xffffffff - 0.5) * noise;
			const i = (y * width + x) * 4;
			data[i] = data[i + 1] = data[i + 2] = value;
			data[i + 3] = 255;
		}
	}
	return { width, height, data };
}

function nearCorners(actual, expected, tolerance = 6) {
	assert.ok(actual, "should detect a cover");
	assert.equal(actual.length, 4);
	actual.forEach((p, i) => assert.ok(Math.hypot(p.x - expected[i].x, p.y - expected[i].y) < tolerance,
		`corner ${i}: ${JSON.stringify(p)} should be near ${JSON.stringify(expected[i])}`));
}

test("finds all four cover corners in crop order", () => {
	const points = [{ x: 55, y: 40 }, { x: 265, y: 40 }, { x: 265, y: 360 }, { x: 55, y: 360 }];
	nearCorners(detectCorners(photo(points)), points);
});

test("finds a perspective cover despite printed artwork and noise", () => {
	const points = [{ x: 90, y: 45 }, { x: 272, y: 78 }, { x: 250, y: 355 }, { x: 40, y: 325 }];
	nearCorners(detectCorners(photo(points, { artwork: true, noise: 26 })), points);
});

test("detects dark covers on light surfaces", () => {
	const points = [{ x: 60, y: 45 }, { x: 270, y: 60 }, { x: 260, y: 340 }, { x: 40, y: 355 }];
	nearCorners(detectCorners(photo(points, { background: 220, cover: 30, noise: 15 })), points);
});

test("detects a narrow spine", () => {
	const points = [{ x: 145, y: 40 }, { x: 175, y: 40 }, { x: 175, y: 360 }, { x: 145, y: 360 }];
	nearCorners(detectCorners(photo(points)), points);
});

test("detects landscape photos after a quarter-turn", () => {
	const points = [{ x: 40, y: 55 }, { x: 360, y: 55 }, { x: 360, y: 265 }, { x: 40, y: 265 }];
	nearCorners(detectCorners(photo(points, { width: 400, height: 320 })), points);
});

test("blank, low contrast, and noisy photos fall back to manual placement", () => {
	assert.equal(detectCorners(photo(null)), null);
	assert.equal(detectCorners(photo(null, { noise: 80 })), null);
	const points = [{ x: 55, y: 40 }, { x: 265, y: 40 }, { x: 265, y: 360 }, { x: 55, y: 360 }];
	assert.equal(detectCorners(photo(points, { background: 35, cover: 38 })), null);
});

test("does not invent the missing edge of a partly offscreen book", () => {
	const points = [{ x: -40, y: 40 }, { x: 265, y: 40 }, { x: 265, y: 360 }, { x: -40, y: 360 }];
	assert.equal(detectCorners(photo(points)), null);
});

test("rejects invalid or unbounded input", () => {
	assert.equal(detectCorners({ width: 100, height: 100, data: new Uint8ClampedArray(4) }), null);
	assert.equal(detectCorners({ width: 2048, height: 2048, data: new Uint8ClampedArray(0) }), null);
});
