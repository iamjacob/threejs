// Shelves ⇄ map on the Android debug APK (native WebView, WebGL, native SQLite checkpoint).
// The radial menu is opened and fired with the keyboard path (Enter on focused buttons), which the
// controller supports for accessibility; real touch steering is covered by android-map-play.mjs.
// Usage: npm run test:android:scene   (needs an emulator/device, JDK 21 as JAVA_HOME)
import assert from "node:assert/strict";
import { _android as android } from "playwright-core";

const APP = "me.jacobg.boooks";
const [device] = await android.devices();
assert.ok(device, "an adb device/emulator is connected");
const shell = async (c) => (await device.shell(c)).toString().trim();
let passed = 0;
const step = (n) => console.log(`✔ ${n} (${++passed})`);

const controller = (page) => page.getByRole("button", { name: /Controller: drag to steer/ });
const overlay = (page) => page.getByTestId("scene-transition");
async function menu(page, label) {
	await controller(page).focus();
	await page.keyboard.press("Enter"); // opens the wheel
	const item = page.locator(`button.bc-item[aria-label="${label}"][tabindex="0"]`).first();
	await item.focus();
	await page.keyboard.press("Enter");
}

try {
	await shell(`pm clear ${APP}`);
	await shell(`am start -n ${APP}/.MainActivity`);
	const page = await (await device.webView({ pkg: APP }, { timeout: 60_000 })).page();
	page.on("pageerror", (e) => console.log("  pageerror:", e.message));
	await controller(page).waitFor({ timeout: 120_000 });

	for (let round = 1; round <= 2; round++) {
		await menu(page, "Open map");
		await overlay(page).waitFor({ timeout: 5_000 });
		await page.getByTestId("map-play-status").filter({ hasNotText: "Loading" }).waitFor({ timeout: 90_000 });
		await overlay(page).waitFor({ state: "detached", timeout: 30_000 });
		await menu(page, "Shelves");
		await overlay(page).waitFor({ timeout: 5_000 });
		await controller(page).waitFor({ timeout: 120_000 });
		await overlay(page).waitFor({ state: "detached", timeout: 30_000 });
		assert.equal(await page.getByTestId("map-play").count(), 0, "map unmounted on the shelves");
		step(`android round ${round}: shelves → map → shelves through the joystick menu`);
	}
	await menu(page, "Open map");
	await overlay(page).waitFor({ state: "detached", timeout: 90_000 });
	assert.match(await page.getByTestId("map-play-meta").innerText(), /checkpoint (restored|saved)/);
	step("android: checkpoint written on leave (native SQLite) and restored on return");
	console.log(`\nandroid-scene-switch: ${passed} checks passed`);
} catch (error) {
	console.error("✖ android-scene-switch failed:", error);
	process.exitCode = 1;
} finally {
	await device.close();
}
