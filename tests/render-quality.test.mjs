import assert from "node:assert/strict";
import { test } from "node:test";
import {
	detectRenderQuality,
	maxShelfImageLevel,
	shelfAnisotropy,
} from "../src/lib/renderQuality.ts";

test("shelf covers stop at detail (medium on low tier) and low tiers halve anisotropy", () => {
	const high = detectRenderQuality({});
	const low = detectRenderQuality({ saveData: true });
	assert.equal(maxShelfImageLevel(high), "detail");
	assert.equal(maxShelfImageLevel(low), "medium");
	assert.equal(shelfAnisotropy(high), 4);
	assert.equal(shelfAnisotropy(low), 2);
});

test("desktops render at up to 1.5x with full shadows", () => {
	const quality = detectRenderQuality({
		hardwareConcurrency: 10,
		deviceMemory: 8,
		userAgent: "Mozilla/5.0 (Macintosh)",
	});
	assert.equal(quality.tier, "high");
	assert.deepEqual(quality.dpr, [1, 1.5]);
	assert.equal(quality.shadowMapSize, 1024);
	assert.equal(quality.shadows, true);
	assert.equal(quality.pointLights, true);
});

test("few cores, little memory, save-data, or mid-range phones drop to 1x", () => {
	for (const hints of [
		{ hardwareConcurrency: 4, deviceMemory: 8 },
		{ hardwareConcurrency: 8, deviceMemory: 2 },
		{ hardwareConcurrency: 8, deviceMemory: 8, saveData: true },
		{ hardwareConcurrency: 6, deviceMemory: 4, userAgent: "Android 12; Mobile" },
	]) {
		const quality = detectRenderQuality(hints);
		assert.equal(quality.tier, "low", JSON.stringify(hints));
		assert.deepEqual(quality.dpr, [1, 1]);
		assert.equal(quality.shadowMapSize, 512);
		assert.equal(quality.shadows, false);
		assert.equal(quality.pointLights, false);
	}
});

test("unknown hardware is treated as capable", () => {
	assert.equal(detectRenderQuality({}).tier, "high");
});
