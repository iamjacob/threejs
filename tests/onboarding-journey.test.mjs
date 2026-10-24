import assert from "node:assert/strict";
import { test } from "node:test";
import {
	flightProgress,
	flightShift,
} from "../src/onboarding/flight.ts";
import {
	BEATS,
	createJourney,
	END_HIDE,
	END_SHOW,
	JOURNEY_LIMIT,
	nextStation,
	endVisible,
	eyeBackoff,
	frameDelta,
	MAX_INPUT_STEP,
	queueStep,
	ringCount,
	showScrollHint,
	soundtrackDrives,
	stepJourney,
	trackProgress,
	wheelStep,
	closestPlaneDistance,
} from "../src/onboarding/journey.ts";
import { selectOnboardingBooks } from "../src/onboarding/selection.ts";
import worker from "../src/worker.ts";

test("one wheel notch and a two-second hitch stay short of the first card", () => {
	const state = createJourney();
	queueStep(state, wheelStep(100));
	stepJourney(state, 2, { reduced: false, audioProgress: null });
	assert.ok(state.display > 0);
	assert.ok(state.display < BEATS[0].t);
	assert.equal(frameDelta(2), 1 / 30);
});

test("a full second of queued scroll stays under the first beat gap", () => {
	const state = createJourney();
	state.pending = 1;
	for (let frame = 0; frame < 60; frame += 1) {
		stepJourney(state, 1 / 60, { reduced: false, audioProgress: null });
	}
	assert.ok(state.display > 0.04);
	assert.ok(state.display < 0.15);
});

test("scrolling back from the end leaves the outro", () => {
	const state = createJourney();
	state.display = 1;
	state.target = 1;
	state.pending = -1;
	let visible = true;
	for (let frame = 0; frame < 240 && visible; frame += 1) {
		stepJourney(state, 1 / 30, { reduced: false, audioProgress: null });
		visible = endVisible(state.display, visible);
	}
	assert.equal(visible, false);
	assert.ok(state.display < END_HIDE);
});

test("the last continue aims past the outro threshold and stops inside the tunnel", () => {
	const destination = nextStation(BEATS[BEATS.length - 1].t, 1);
	assert.ok(destination > END_SHOW);
	assert.ok(destination <= JOURNEY_LIMIT);
});

test("the outro uses hysteresis so it does not flicker on the threshold", () => {
	assert.equal(endVisible(0.92, false), false);
	assert.equal(endVisible(0.93, false), true);
	assert.equal(endVisible(0.9, true), true);
	assert.equal(endVisible(0.88, true), false);
});

test("reduced motion snaps the camera to the queued target", () => {
	const state = createJourney();
	state.pending = 0.5;
	stepJourney(state, 2, { reduced: true, audioProgress: null });
	assert.equal(state.display, 0.5);
	assert.equal(state.target, 0.5);
	assert.equal(state.pending, 0);
});

test("an accelerated wheel still counts as one notch", () => {
	assert.equal(wheelStep(5000), MAX_INPUT_STEP);
	assert.equal(wheelStep(100), MAX_INPUT_STEP);
	assert.equal(wheelStep(-5000), -MAX_INPUT_STEP);
});

test("book flights ease in and settle with no leftover offset", () => {
	assert.equal(flightProgress(0, 1, true), 1);
	assert.equal(flightProgress(0, 1, false), 0);
	assert.equal(flightProgress(1 + 2.7, 1, false), 1);
	const mid = flightProgress(1 + 1.35, 1, false);
	assert.ok(mid > 0 && mid < 1);
	assert.ok(flightShift(0.5, 0, false).y > 0);
	assert.deepEqual(flightShift(1, 0, false), { x: 0, y: 0, z: 0 });
	assert.deepEqual(flightShift(0.2, 1, true), { x: 0, y: 0, z: 0 });
});

test("a quiet rhythm prefers Seneca and leaves Blitzscaling on the shelf", () => {
	const picked = selectOnboardingBooks(
		[
			{ title: "Seneca", pages: 106 },
			{ title: "Blitzscaling", pages: 320 },
			{ title: "The Daily Stoic", pages: 400 },
			{ title: "Stilness is the key", pages: 304 },
		],
		{ rhythm: "In quiet moments", identity: "" },
	);
	assert.ok(picked.some((book) => book.title === "Seneca"));
	assert.equal(
		picked.some((book) => book.title === "Blitzscaling"),
		false,
	);
});

test("the tunnel never rebuilds the prototype's 1444 meshes", () => {
	assert.ok(ringCount(1_000_000) <= 80);
	assert.notEqual(ringCount(1_000_000), 1444);
	assert.equal(ringCount(0), 18);
});

test("the scroll hint is hidden while a card or the outro is up", () => {
	assert.equal(showScrollHint("journey", true, false), false);
	assert.equal(showScrollHint("journey", false, true), false);
	assert.equal(showScrollHint("intro", false, false), false);
	assert.equal(showScrollHint("journey", false, false), true);
});

test("a missing soundtrack duration leaves scroll in charge", () => {
	assert.equal(trackProgress(1, Number.NaN), null);
	assert.equal(trackProgress(1, 0), null);
	assert.equal(trackProgress(5, 10), 0.5);
	assert.equal(soundtrackDrives(false, false, 10, true), false);
	assert.equal(soundtrackDrives(false, false, 10, false), true);
	assert.equal(soundtrackDrives(true, false, 10, false), false);
	assert.equal(soundtrackDrives(false, false, Number.NaN, false), false);
});

test("the eye backs up until it clears every ring plane", () => {
	const rings = [
		{ position: [0, 0, 0], tangent: [0, 0, -1] },
		{ position: [0, 0, -4], tangent: [0, 0, -1] },
	];
	const tangent = [0, 0, -1];
	const point = [0, 0, -2];
	const back = eyeBackoff(point, tangent, rings, 1.35);
	const eye = [
		point[0] - tangent[0] * back,
		point[1] - tangent[1] * back,
		point[2] - tangent[2] * back,
	];
	assert.ok(closestPlaneDistance(eye, rings) >= 1.35);
});

test("extensionless client routes fall back to the app shell", async () => {
	const requests = [];
	const missing = new Response("missing", { status: 404 });
	const shell = new Response("app", { status: 200 });
	const result = await worker.fetch(
		new Request("https://boooks.app/threejs/onboarding"),
		{
			ASSETS: {
				fetch(request) {
					requests.push(request.url);
					return Promise.resolve(
						request.url.endsWith("/index.html") ? shell : missing,
					);
				},
			},
		},
	);
	assert.deepEqual(requests, [
		"https://boooks.app/onboarding",
		"https://boooks.app/index.html",
	]);
	assert.equal(result, shell);
});

test("a missing script keeps the original 404", async () => {
	const response = new Response("Not found", { status: 404 });
	let calls = 0;
	const result = await worker.fetch(
		new Request("https://boooks.app/threejs/assets/missing.js"),
		{
			ASSETS: {
				fetch() {
					calls += 1;
					return Promise.resolve(response);
				},
			},
		},
	);
	assert.equal(result, response);
	assert.equal(calls, 1);
});
