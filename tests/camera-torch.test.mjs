import assert from "node:assert/strict";
import { test } from "node:test";
import { createCameraTorch } from "../src/components/scanner/cameraTorch.ts";

const settle = () => new Promise((resolve) => setImmediate(resolve));
function fakeTrack({ capability = true, initial = false, settings = true, reject = false } = {}) {
	let enabled = initial;
	let constraints = { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, advanced: [{ zoom: 1.5, torch: initial }] };
	const calls = [];
	return {
		readyState: "live",
		getCapabilities: () => ({ torch: capability }),
		getSettings: () => settings ? { torch: enabled } : {},
		getConstraints: () => constraints,
		async applyConstraints(next) {
			calls.push(next);
			if (reject) throw new Error("Torch unavailable");
			constraints = next;
			enabled = next.advanced.at(-1).torch;
		},
		calls,
		get illuminated() { return enabled; },
	};
}

test("unsupported, missing, and ended tracks never apply torch constraints", async () => {
	for (const track of [null, fakeTrack({ capability: false }), fakeTrack({ capability: [false] }), Object.assign(fakeTrack(), { getCapabilities: () => ({}) })]) {
		const torch = createCameraTorch(track);
		assert.equal(torch.supported, false);
		assert.equal(await torch.setEnabled(true), false);
		torch.dispose();
		await settle();
		if (track) assert.equal(track.calls.length, 0);
	}
	const track = fakeTrack();
	track.readyState = "ended";
	const torch = createCameraTorch(track);
	assert.equal(torch.supported, false);
	assert.equal(await torch.setEnabled(true), false);
	assert.equal(track.calls.length, 0);
});

test("boolean and boolean-list capabilities toggle the existing camera and preserve its constraints", async () => {
	for (const capability of [true, [false, true]]) {
		const track = fakeTrack({ capability });
		const torch = createCameraTorch(track);
		assert.equal(torch.supported, true);
		assert.equal(torch.enabled, false);
		assert.equal(await torch.setEnabled(true), true);
		assert.equal(torch.enabled, true);
		assert.deepEqual(track.calls[0], {
			facingMode: { ideal: "environment" }, width: { ideal: 1920 },
			advanced: [{ zoom: 1.5 }, { torch: true }],
		});
		assert.equal(await torch.setEnabled(false), true);
		assert.equal(torch.enabled, false);
		torch.dispose();
		await settle();
		assert.equal(track.illuminated, false);
	}
});

test("current settings are respected; successful updates work when torch settings are omitted", async () => {
	const initiallyOn = createCameraTorch(fakeTrack({ initial: true }));
	assert.equal(initiallyOn.enabled, true);
	initiallyOn.dispose();
	const torch = createCameraTorch(fakeTrack({ settings: false }));
	assert.equal(await torch.setEnabled(true), true);
	assert.equal(torch.enabled, true);
	assert.equal(await torch.setEnabled(false), true);
	assert.equal(torch.enabled, false);
});

test("capability errors and constraint rejection fail gracefully without claiming the light is on", async () => {
	const missing = fakeTrack();
	missing.getCapabilities = () => { throw new Error("Unsupported"); };
	assert.equal(createCameraTorch(missing).supported, false);
	const track = fakeTrack({ reject: true });
	const torch = createCameraTorch(track);
	assert.equal(await torch.setEnabled(true), false);
	assert.equal(torch.enabled, false);
	torch.dispose();
	await settle();
});

test("disposing during an in-flight enable queues torch-off after the late result", async () => {
	const track = fakeTrack();
	const apply = track.applyConstraints.bind(track);
	let finish;
	track.applyConstraints = async (constraints) => {
		if (constraints.advanced.at(-1).torch)
			await new Promise((resolve) => { finish = resolve; });
		await apply(constraints);
	};
	const torch = createCameraTorch(track);
	const pending = torch.setEnabled(true);
	await settle();
	torch.dispose();
	torch.dispose();
	finish();
	assert.equal(await pending, false);
	await settle();
	assert.equal(track.illuminated, false);
	assert.equal(torch.enabled, false);
	assert.equal(torch.supported, false);
	assert.deepEqual(track.calls.map((call) => call.advanced.at(-1).torch), [true, false]);
	assert.equal(await torch.setEnabled(true), false);
});

test("a superseded request does not turn the light on after the latest off request", async () => {
	const track = fakeTrack();
	const torch = createCameraTorch(track);
	const old = torch.setEnabled(true);
	const latest = torch.setEnabled(false);
	assert.equal(await old, false);
	assert.equal(await latest, true);
	assert.equal(torch.enabled, false);
	assert.deepEqual(track.calls.map((call) => call.advanced.at(-1).torch), [false]);
});
