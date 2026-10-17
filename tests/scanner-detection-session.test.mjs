import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { detectPhotoCorners } from "../src/components/scanner/detectPhotoCorners.ts";

let originals;
let workers;
let timer;
beforeEach(() => {
	originals = Object.fromEntries(["document", "window", "Worker"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
	workers = [];
	timer = null;
	globalThis.document = {
		createElement() {
			return {
				getContext: () => ({
					drawImage() {},
					getImageData: (_x, _y, width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
				}),
			};
		},
	};
	globalThis.window = {
		setTimeout(callback) { timer = callback; return 1; },
		clearTimeout() { timer = null; },
	};
	globalThis.Worker = class {
		stopped = 0;
		constructor() { workers.push(this); }
		postMessage(pixels, transfers) { this.pixels = pixels; this.transfers = transfers; }
		terminate() { this.stopped++; }
	};
});
afterEach(() => {
	for (const [key, descriptor] of Object.entries(originals)) {
		if (descriptor) Object.defineProperty(globalThis, key, descriptor);
		else delete globalThis[key];
	}
});

test("maps detected corners from the worker sample to original photo pixels", async () => {
	const source = { width: 2001, height: 2560 };
	const promise = detectPhotoCorners(source, new AbortController().signal);
	const worker = workers[0];
	assert.equal(worker.pixels.height, 512);
	assert.equal(worker.pixels.width, 400);
	assert.equal(worker.transfers[0], worker.pixels.data.buffer);
	worker.onmessage({ data: [{ x: 40, y: 50 }, { x: 360, y: 50 }, { x: 360, y: 450 }, { x: 40, y: 450 }] });
	assert.deepEqual(await promise, [{ x: 200.1, y: 250 }, { x: 1800.9, y: 250 }, { x: 1800.9, y: 2250 }, { x: 200.1, y: 2250 }]);
	assert.equal(worker.stopped, 1);
	assert.equal(timer, null);
});

test("canceling a detection terminates its worker and discards late corners", async () => {
	const controller = new AbortController();
	const promise = detectPhotoCorners({ width: 640, height: 800 }, controller.signal);
	controller.abort();
	assert.equal(workers[0].stopped, 1);
	assert.equal(timer, null);
	workers[0].onmessage({ data: [{ x: 100, y: 100 }] });
	assert.equal(await promise, null);
});

test("an already canceled detection never starts a worker", async () => {
	const controller = new AbortController();
	controller.abort();
	assert.equal(await detectPhotoCorners({ width: 640, height: 800 }, controller.signal), null);
	assert.equal(workers.length, 0);
});

test("a stalled or failed worker releases resources for manual fallback", async () => {
	const timeout = detectPhotoCorners({ width: 640, height: 800 }, new AbortController().signal);
	timer();
	assert.equal(await timeout, null);
	assert.equal(workers[0].stopped, 1);
	const error = detectPhotoCorners({ width: 640, height: 800 }, new AbortController().signal);
	workers[1].onerror({ preventDefault() {} });
	await assert.rejects(error, /Corner detection unavailable/);
	assert.equal(workers[1].stopped, 1);
	assert.equal(timer, null);
});
