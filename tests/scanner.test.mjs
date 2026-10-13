import assert from "node:assert/strict";
import { test } from "node:test";
import { createCameraSession } from "../src/components/scanner/cameraSession.ts";
import { isValidQuadrilateral, squareToQuad, outputDimensions } from "../src/components/scanner/perspective.ts";

const deferred = () => {
	let resolve, reject;
	const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
};
const fakeStream = () => {
	const track = { stopped: 0, stop() { this.stopped++; } };
	return { track, getTracks: () => [track] };
};

test("creating the scanner's camera session never requests permission", () => {
	let requests = 0;
	const session = createCameraSession(() => { requests++; return Promise.resolve(fakeStream()); });
	assert.equal(requests, 0);
	session.stop();
	assert.equal(requests, 0);
});

test("an explicitly started camera is stopped after capture or exit", async () => {
	const stream = fakeStream();
	const session = createCameraSession(async () => stream);
	assert.equal(await session.start(), stream);
	session.stop(); session.stop();
	assert.equal(stream.track.stopped, 1);
});

test("granting permission after cancel or unmount cannot leave the camera running", async () => {
	const permission = deferred();
	const stream = fakeStream();
	const session = createCameraSession(() => permission.promise);
	const starting = session.start();
	session.stop();
	permission.resolve(stream);
	assert.equal(await starting, null);
	assert.equal(stream.track.stopped, 1);
});

test("a stale camera request cannot replace a newer stream", async () => {
	const first = deferred();
	const second = deferred();
	const oldStream = fakeStream();
	const newStream = fakeStream();
	let calls = 0;
	const session = createCameraSession(() => calls++ === 0 ? first.promise : second.promise);
	const oldStart = session.start();
	const newStart = session.start();
	second.resolve(newStream);
	assert.equal(await newStart, newStream);
	first.resolve(oldStream);
	assert.equal(await oldStart, null);
	assert.equal(oldStream.track.stopped, 1);
	assert.equal(newStream.track.stopped, 0);
	session.stop();
	assert.equal(newStream.track.stopped, 1);
});

test("permission denial is recoverable; canceled requests do not surface stale errors", async () => {
	const denied = new Error("Permission denied");
	const session = createCameraSession(async () => { throw denied; });
	await assert.rejects(session.start(), denied);
	const later = deferred();
	const canceled = createCameraSession(() => later.promise);
	const pending = canceled.start();
	canceled.stop(); later.reject(denied);
	assert.equal(await pending, null);
});

test("perspective correction maps every destination corner to the chosen source corner", () => {
	for (const points of [
		[{ x: 20, y: 30 }, { x: 620, y: 30 }, { x: 620, y: 830 }, { x: 20, y: 830 }],
		[{ x: 140, y: 180 }, { x: 760, y: 40 }, { x: 640, y: 900 }, { x: 60, y: 700 }],
	]) {
		assert.equal(isValidQuadrilateral(points), true);
		const h = squareToQuad(points);
		for (const [i, [u, v]] of [[0,0], [1,0], [1,1], [0,1]].entries()) {
			const divisor = h[6] * u + h[7] * v + 1;
			assert.ok(Math.abs((h[0] * u + h[1] * v + h[2]) / divisor - points[i].x) < 1e-8);
			assert.ok(Math.abs((h[3] * u + h[4] * v + h[5]) / divisor - points[i].y) < 1e-8);
		}
	}
});

test("crossed, incomplete, concave and degenerate crop outlines are rejected", () => {
	assert.equal(isValidQuadrilateral([]), false);
	assert.equal(isValidQuadrilateral([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }]), false);
	assert.equal(isValidQuadrilateral([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 100 }]), false);
	assert.equal(isValidQuadrilateral(Array.from({ length: 4 }, (_, i) => ({ x: i, y: i }))), false);
	assert.equal(isValidQuadrilateral([{ x: NaN, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]), false);
});

test("crop output preserves the cover aspect ratio", () => {
	assert.deepEqual(outputDimensions([{ x: 20, y: 30 }, { x: 620, y: 30 }, { x: 620, y: 830 }, { x: 20, y: 830 }]), { width: 600, height: 800 });
});
