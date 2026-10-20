import assert from "node:assert/strict";
import { test } from "node:test";
import {
	coverRectToVideo,
	createScannerPortalRenderer,
	fallbackGuideRect,
	GUIDE_PORTAL_SIZE,
	PORTAL_SHAPES,
	portalWindowRect,
	portalCanvasSize,
	portalCropRect,
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

test("portal crop keeps the centred part of the frame the window shows", () => {
	// Cover window is 3:4 (half-extents 0.3 x 0.4). A 4:3 landscape frame is cut on x.
	assert.deepEqual(portalCropRect(1600, 1200, PORTAL_SHAPES.front), {
		x: 350,
		y: 0,
		width: 900,
		height: 1200,
	});
	// A frame with the window's own aspect is kept whole.
	assert.deepEqual(portalCropRect(900, 1200, PORTAL_SHAPES.front), {
		x: 0,
		y: 0,
		width: 900,
		height: 1200,
	});
	// A taller frame is cut on y instead, centred.
	const tall = portalCropRect(1000, 2000, PORTAL_SHAPES.front);
	assert.equal(tall.x, 0);
	assert.equal(tall.width, 1000);
	assert.equal(tall.height, 1333);
	assert.equal(tall.y, 333);
	// The spine window is a narrow centred strip of the full height.
	const spine = portalCropRect(1200, 1600, PORTAL_SHAPES.spine);
	assert.equal(spine.y, 0);
	assert.equal(spine.height, 1600);
	assert.ok(spine.width < 400);
	assert.equal(spine.x * 2 + spine.width, 1200);
});

test("0.4 guide window is 22% smaller and centred like the shader draws it", () => {
	const full = portalWindowRect(800, 1000, PORTAL_SHAPES.front, 1);
	const guide = portalWindowRect(800, 1000, PORTAL_SHAPES.front, GUIDE_PORTAL_SIZE);
	assert.ok(Math.abs(guide.width / full.width - 0.78) < 1e-9);
	assert.ok(Math.abs(guide.height / full.height - 0.78) < 1e-9);
	// Same centre: x in the middle, y nudged down 1.5% of the height.
	assert.ok(Math.abs(guide.x + guide.width / 2 - 400) < 1e-9);
	assert.ok(Math.abs(guide.y + guide.height / 2 - 515) < 1e-9);
	// Portrait 0.8 aspect: cover half-extents 0.3 × 0.4 of the height.
	assert.ok(Math.abs(full.width - 600) < 1e-9);
	assert.ok(Math.abs(full.height - 800) < 1e-9);
});

test("full-screen capture keeps only what is inside the guide", () => {
	// 1000×500 screen, 1920×1080 camera with object-fit: cover.
	const view = { w: 1000, h: 500 };
	const rect = { x: 400, y: 100, width: 200, height: 300 };
	const crop = coverRectToVideo(rect, view.w, view.h, 1920, 1080);
	// cover scale = max(1000/1920, 500/1080) = 0.5208; offsetY = (500-562.5)/2.
	const scale = Math.max(1000 / 1920, 500 / 1080);
	const offsetY = (500 - 1080 * scale) / 2;
	assert.equal(crop.x, Math.round(400 / scale));
	assert.equal(crop.y, Math.round((100 - offsetY) / scale));
	assert.ok(Math.abs(crop.width - 200 / scale) <= 1);
	assert.ok(Math.abs(crop.height - 300 / scale) <= 1);
	// The crop's aspect is the guide's aspect: nothing from outside sneaks in.
	assert.ok(Math.abs(crop.width / crop.height - 200 / 300) < 0.01);
	// A guide past the edges is clamped to the frame.
	const edge = coverRectToVideo({ x: -50, y: -50, width: 2000, height: 900 }, 1000, 500, 1920, 1080);
	assert.ok(edge.x >= 0 && edge.y >= 0);
	assert.ok(edge.x + edge.width <= 1920 && edge.y + edge.height <= 1080);
});

test("without WebGL the CSS guide box is the same 22%-smaller centred box", () => {
	const box = fallbackGuideRect(1000, 800, "front", GUIDE_PORTAL_SIZE);
	assert.ok(Math.abs(box.width - 1000 * 0.6 * 0.78) < 1e-9);
	assert.ok(Math.abs(box.height - 800 * 0.8 * 0.78) < 1e-9);
	assert.ok(Math.abs(box.x * 2 + box.width - 1000) < 1e-9);
	const spine = fallbackGuideRect(1000, 800, "spine", GUIDE_PORTAL_SIZE);
	assert.ok(spine.width < box.width / 3);
});

test("guide mode streams camera frames into the window and reuses a still frame", () => {
	const fake = context();
	const renderer = createScannerPortalRenderer(fake.canvas);
	const video = { readyState: 2, videoWidth: 640, videoHeight: 480, currentTime: 1 };
	const frame = { scale: 1, live: true, video, guide: true, size: GUIDE_PORTAL_SIZE };
	renderer.draw({ ...frame, time: 0 });
	renderer.draw({ ...frame, time: 1 });
	assert.equal(fake.uploads.length, 2, "placeholder plus one camera frame");
	video.currentTime = 2;
	renderer.draw({ ...frame, time: 2 });
	assert.equal(fake.uploads.length, 3);
	assert.equal(fake.draws, 3);
	renderer.dispose(true);
});

test("the window shows the same video pixels the capture keeps", () => {
	// The shader maps the feed with object-fit: cover over the whole canvas,
	// so a point at the window's corner samples the video pixel that
	// coverRectToVideo puts at the crop's corner.
	const [w, h, vw, vh] = [1000, 800, 1920, 1080];
	const win = portalWindowRect(w, h, PORTAL_SHAPES.front, GUIDE_PORTAL_SIZE);
	const crop = coverRectToVideo(win, w, h, vw, vh);
	const ca = w / h;
	const va = vw / vh;
	const sample = (x, y) => {
		let sx = x / w;
		let sy = y / h;
		if (va > ca) sx = (sx - 0.5) * (ca / va) + 0.5;
		else sy = (sy - 0.5) * (va / ca) + 0.5;
		return { x: sx * vw, y: sy * vh };
	};
	const topLeft = sample(win.x, win.y);
	const bottomRight = sample(win.x + win.width, win.y + win.height);
	assert.ok(Math.abs(topLeft.x - crop.x) <= 1);
	assert.ok(Math.abs(topLeft.y - crop.y) <= 1);
	assert.ok(Math.abs(bottomRight.x - (crop.x + crop.width)) <= 1);
	assert.ok(Math.abs(bottomRight.y - (crop.y + crop.height)) <= 1);
});

test("portal crop padding grows the region evenly and stays inside the frame", () => {
	const plain = portalCropRect(1600, 1200, PORTAL_SHAPES.front);
	const padded = portalCropRect(1600, 1200, PORTAL_SHAPES.front, 0.1);
	assert.ok(padded.width > plain.width);
	assert.equal(padded.x * 2 + padded.width, plain.x * 2 + plain.width);
	assert.ok(padded.y >= 0 && padded.y + padded.height <= 1200);
	assert.deepEqual(portalCropRect(1600, 1200, PORTAL_SHAPES.front, 5), {
		x: 0,
		y: 0,
		width: 1600,
		height: 1200,
	});
	const bad = portalCropRect(Number.NaN, 0, PORTAL_SHAPES.front, 0.04);
	assert.ok(bad.width >= 1 && bad.height >= 1);
});

