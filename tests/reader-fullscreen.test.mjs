import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { requestReaderFullscreen, exitReaderFullscreen } from "../src/components/reader/readerFullscreen.ts";

let originalDocument;
let surface;
let opened;
let calls;
beforeEach(() => {
	originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
	opened = true;
	calls = [];
	surface = { async requestFullscreen() { calls.push("reader"); document.fullscreenElement = surface; } };
	globalThis.document = {
		fullscreenEnabled: true,
		fullscreenElement: null,
		documentElement: { requestFullscreen() { assert.fail("The library must not cover the reader"); } },
		querySelector(selector) {
			assert.equal(selector, "dialog[open] [data-reader-surface]");
			return opened ? surface : null;
		},
		async exitFullscreen() { calls.push("exit"); document.fullscreenElement = null; },
	};
});
afterEach(() => {
	if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
	else delete globalThis.document;
});

test("Read fullscreens only the mounted reader content, never the library document", async () => {
	await requestReaderFullscreen();
	assert.deepEqual(calls, ["reader"]);
	assert.equal(document.fullscreenElement, surface);
	exitReaderFullscreen(surface);
	assert.deepEqual(calls, ["reader", "exit"]);
});

test("no fullscreen request is made if the reader did not open", async () => {
	opened = false;
	await requestReaderFullscreen();
	assert.deepEqual(calls, []);
});

test("unsupported or rejected fullscreen leaves the viewport reader available", async () => {
	document.fullscreenEnabled = false;
	await requestReaderFullscreen();
	assert.deepEqual(calls, []);
	document.fullscreenEnabled = true;
	surface.requestFullscreen = async () => { throw new Error("No user activation"); };
	await assert.doesNotReject(requestReaderFullscreen());
	assert.equal(document.fullscreenElement, null);
});

test("closing a reader does not exit fullscreen owned by another surface", async () => {
	const other = {};
	document.fullscreenElement = other;
	await requestReaderFullscreen();
	exitReaderFullscreen(surface);
	exitReaderFullscreen(null);
	assert.deepEqual(calls, []);
	assert.equal(document.fullscreenElement, other);
});

test("leaving and reentering fullscreen keeps the same reader surface", async () => {
	await requestReaderFullscreen();
	await document.exitFullscreen();
	await requestReaderFullscreen();
	assert.equal(document.fullscreenElement, surface);
	assert.deepEqual(calls, ["reader", "exit", "reader"]);
});

test("Foliate Settings uses the containing reader surface and also supports standalone reading", async () => {
	const source = (await readFile(new URL("../public/reader/reader.js", import.meta.url), "utf8"))
		.replace(/^import .+$/gm, "");
	for (const embedded of [true, false]) {
		const controls = new Map();
		const fullscreenEvents = new Map();
		const screenDocument = {
			fullscreenEnabled: true,
			fullscreenElement: null,
			addEventListener(type, listener) { fullscreenEvents.set(type, listener); },
			async exitFullscreen() { this.fullscreenElement = null; fullscreenEvents.get("fullscreenchange")(); },
		};
		const target = {
			ownerDocument: screenDocument,
			async requestFullscreen() {
				screenDocument.fullscreenElement = target;
				fullscreenEvents.get("fullscreenchange")();
			},
		};
		const localDocument = {
			...screenDocument,
			documentElement: embedded ? { dataset: {} } : Object.assign(target, { dataset: {} }),
			getElementById(id) {
				if (!controls.has(id)) controls.set(id, { hidden: true, listeners: {}, setAttribute() {}, addEventListener(type, callback) { this.listeners[type] = callback; } });
				return controls.get(id);
			},
		};
		const context = {
			document: localDocument,
			window: { frameElement: embedded ? { closest: () => target } : null, addEventListener() {} },
			parent: {},
			location: { search: "", origin: "https://reader.test", href: "https://reader.test/reader/index.html" },
			URLSearchParams,
			readSettings: () => ({ size: 18, zoom: 1, dark: false, shake: false }),
			readStored: () => null,
			writeStored() {},
			settingsKey: "settings",
			isSecureContext: true,
		};
		await vm.runInNewContext(`(async () => { ${source}\n })()`, context);
		const button = controls.get("fullscreen");
		assert.equal(button.textContent, "Enter fullscreen");
		await button.listeners.click();
		assert.equal(screenDocument.fullscreenElement, target);
		assert.equal(button.textContent, "Exit fullscreen");
		await button.listeners.click();
		assert.equal(screenDocument.fullscreenElement, null);
		assert.equal(button.textContent, "Enter fullscreen");
	}
});
