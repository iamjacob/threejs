import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createScannerPortalRenderer,
	portalCanvasSize,
	portalOpeningScale,
	portalVideoTextureSize,
} from "../src/components/scanner/scannerPortalRenderer.ts";

function context({ compile = true } = {}) {
	const deleted = { shader: 0, program: 0, buffer: 0, texture: 0, context: 0 };
	const uploads = [];
	let draws = 0;
	const gl = new Proxy({
		createShader: () => ({}), createProgram: () => ({}),
		createBuffer: () => ({}), createTexture: () => ({}),
		getShaderParameter: () => compile, getProgramParameter: () => true,
		getAttribLocation: () => 0, getUniformLocation: () => ({}),
		isContextLost: () => false,
		texImage2D: (...args) => uploads.push(args.at(-1)),
		drawArrays: () => draws++,
		deleteShader: () => deleted.shader++, deleteProgram: () => deleted.program++,
		deleteBuffer: () => deleted.buffer++, deleteTexture: () => deleted.texture++,
		getExtension: () => ({ loseContext: () => deleted.context++ }),
	}, { get: (target, key) => key in target ? target[key] : /^[A-Z_0-9]+$/.test(key) ? 1 : () => {} });
	const canvas = { clientWidth: 400, clientHeight: 500, width: 300, height: 150, getContext: () => gl };
	return { canvas, deleted, uploads, get draws() { return draws; } };
}

test("portal opening finishes in 650ms and reduced motion skips the zoom", () => {
	assert.equal(portalOpeningScale(-10), 0);
	assert.equal(portalOpeningScale(0), 0);
	assert.equal(portalOpeningScale(325), .5);
	assert.equal(portalOpeningScale(650), 1);
	assert.equal(portalOpeningScale(5000), 1);
	assert.equal(portalOpeningScale(0, true), 1);
});

test("portal rendering caps high-DPR dimensions while retaining aspect", () => {
	assert.deepEqual(portalCanvasSize(400, 500, 3), { width: 500, height: 625 });
	assert.deepEqual(portalCanvasSize(1200, 1800, 3), { width: 640, height: 960 });
	assert.deepEqual(portalVideoTextureSize(1920, 2560), { width: 768, height: 1024 });
	assert.deepEqual(portalVideoTextureSize(640, 480), { width: 640, height: 480 });
	assert.deepEqual(portalCanvasSize(0, 0, NaN), { width: 1, height: 1 });
});

test("missing WebGL falls back; shader failure releases partial GPU allocations", () => {
	assert.equal(createScannerPortalRenderer({ getContext: () => null }), null);
	const fake = context({ compile: false });
	assert.throws(() => createScannerPortalRenderer(fake.canvas), /compile/);
	assert.deepEqual(fake.deleted, { shader: 1, program: 1, buffer: 0, texture: 0, context: 1 });
});

test("same video frame is reused and renderer cleanup releases each resource once", () => {
	const fake = context();
	const renderer = createScannerPortalRenderer(fake.canvas);
	const video = { readyState: 2, videoWidth: 640, videoHeight: 480, currentTime: 1 };
	renderer.draw({ time: 0, scale: 1, live: true, video });
	renderer.draw({ time: 1, scale: 1, live: true, video });
	assert.equal(fake.uploads.length, 2, "one initial texture and one camera frame");
	video.currentTime = 2;
	renderer.draw({ time: 2, scale: 1, live: true, video });
	assert.equal(fake.uploads.length, 3);
	renderer.dispose();
	renderer.dispose(true);
	renderer.dispose(true);
	renderer.draw({ time: 3, scale: 1, live: true, video });
	assert.equal(fake.draws, 3);
	assert.deepEqual(fake.deleted, { shader: 2, program: 1, buffer: 1, texture: 1, context: 1 });
});

test("large video previews use a bounded reusable canvas and release its backing storage", () => {
	const previousDocument = globalThis.document;
	let copies = 0;
	const sampled = { width: 300, height: 150, getContext: () => ({ drawImage: () => copies++ }) };
	globalThis.document = { createElement: () => sampled };
	try {
		const fake = context();
		const renderer = createScannerPortalRenderer(fake.canvas);
		const video = { readyState: 2, videoWidth: 1920, videoHeight: 2560, currentTime: 1 };
		renderer.draw({ time: 0, scale: 1, live: true, video });
		assert.equal(sampled.width, 768);
		assert.equal(sampled.height, 1024);
		assert.equal(fake.uploads.at(-1), sampled);
		video.currentTime = 2;
		renderer.draw({ time: 1, scale: 1, live: true, video });
		assert.equal(copies, 2);
		renderer.dispose(true);
		assert.equal(sampled.width, 1);
		assert.equal(sampled.height, 1);
	} finally {
		if (previousDocument === undefined) delete globalThis.document;
		else globalThis.document = previousDocument;
	}
});
