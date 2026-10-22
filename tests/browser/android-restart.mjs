// Drives the debug APK's WebView on a running emulator/device via Playwright's Android support.
// Proves on Android: native SQLite (@capacitor-community/sqlite) → use cases → Zustand → UI,
// native Filesystem FileStore, and persistence across `am force-stop` (process killed).
// Prereqs: emulator running, JDK 21 as JAVA_HOME, adb on PATH. Run via `npm run test:android`, which
// builds with VITE_BOOOKS_TEST_HOOKS=1 (needed for the image step) and installs the debug APK.
// Afterwards, run `npm run cap:sync` again so the native project holds a build without the hook.
import assert from "node:assert/strict";
import { _android as android } from "playwright-core";

const APP = "me.jacobg.boooks";
const [device] = await android.devices();
assert.ok(device, "an adb device/emulator is connected");
const shell = async (command) => (await device.shell(command)).toString().trim();

/** Launches the app and attaches to its WebView page (Playwright's Android WebView support). */
async function startAndAttach() {
	await shell(`am start -n ${APP}/.MainActivity`);
	const webview = await device.webView({ pkg: APP }, { timeout: 60_000 });
	const page = await webview.page();
	page.on("pageerror", (e) => console.log("  pageerror:", e.message));
	const pid = await shell(`pidof ${APP}`);
	return { browser: webview, page, pid };
}

async function openNotes(page) {
	await page.evaluate(() => {
		history.pushState({}, "", "/notes");
		dispatchEvent(new PopStateEvent("popstate"));
	});
	await page.getByTestId("title").waitFor({ timeout: 60_000 });
}
const titles = async (page) => (await page.getByTestId("note-title").allInnerTexts()).sort();
/** Kills the app process (no lifecycle callbacks reach JS), then waits until it is gone. */
async function killApp() {
	await shell(`am force-stop ${APP}`);
	for (let i = 0; i < 20 && (await shell(`pidof ${APP}`)); i++)
		await new Promise((r) => setTimeout(r, 250));
	assert.equal(await shell(`pidof ${APP}`), "", "process is dead");
}

let passed = 0;
const step = (name) => {
	passed++;
	console.log(`✔ ${name}`);
};
try {
	await shell(`pm clear ${APP}`); // fresh install state: empty database
	let { browser, page } = await startAndAttach();
	await openNotes(page);
	assert.match(await page.getByTestId("engine").innerText(), /capacitor-sqlite:android · files: capacitor-filesystem/);
	assert.equal(await page.getByTestId("profile").innerText(), "Guest");
	for (const title of ["Native A", "Native B"]) {
		await page.getByTestId("title").fill(title);
		await page.getByTestId("add").click();
		await page.getByTestId("note-title").filter({ hasText: title }).waitFor();
	}
	await page.getByTestId("note").filter({ hasText: "Native B" }).getByTestId("delete").click();
	await page.getByTestId("note-title").filter({ hasText: "Native B" }).waitFor({ state: "detached" });
	step("android: guest + CRUD through native SQLite → use case → Zustand → UI");

	// Image bytes through the native FileStore. The gallery picker needs a human, so the test uses
	// the debug-only hook (window.__boooksDebug, present only when the build mode isn't "production").
	const attached = await page.evaluate(async () => {
		const png = Uint8Array.from(
			atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
			(c) => c.charCodeAt(0),
		);
		return window.__boooksDebug?.attachToFirstNote(png, "image/png");
	});
	assert.equal(attached, true, "debug hook attached an image");
	await page.locator('[data-testid="note"] img').first().waitFor({ timeout: 15_000 });
	step("android: image bytes via native Filesystem FileStore, metadata in SQLite, rendered back");
	await killApp();
	({ browser, page } = await startAndAttach());
	await openNotes(page);
	await page.getByTestId("note-title").first().waitFor();
	assert.deepEqual(await titles(page), ["Native A"]);
	await page.locator('[data-testid="note"] img').first().waitFor({ timeout: 15_000 });
	step("android: notes + image survive am force-stop (process killed) and relaunch");

	await page.getByTestId("account-name").fill("Ada");
	await page.getByTestId("promote").click();
	await page.getByTestId("profile").filter({ hasText: "Ada" }).waitFor();
	await killApp();
	({ browser, page } = await startAndAttach());
	await openNotes(page);
	await page.getByTestId("profile").filter({ hasText: "Ada" }).waitFor();
	assert.deepEqual(await titles(page), ["Native A"]);
	step("android: guest → local account promotion persists across process kill");
	void browser;
	console.log(`\nandroid-restart: ${passed} checks passed`);
} catch (error) {
	console.error("✖ android-restart failed:", error);
	process.exitCode = 1;
} finally {
	await device.close();
}
