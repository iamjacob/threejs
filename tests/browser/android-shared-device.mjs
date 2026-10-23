// /people on the Android debug APK (native SQLite), driven through the real UI (no test hooks).
// Proves on Android: local people, consented directory, same-device message, and persistence of
// profiles + message across `am force-stop`. Prereqs as tests/browser/android-restart.mjs.
// Usage: npm run test:android:people
import assert from "node:assert/strict";
import { _android as android } from "playwright-core";
import { addPerson, bodies, directoryNames, send, switchTo, turnOn } from "./sharedDeviceHelpers.mjs";

const APP = "me.jacobg.boooks";
const [device] = await android.devices();
assert.ok(device, "an adb device/emulator is connected");
const shell = async (c) => (await device.shell(c)).toString().trim();

async function start() {
	await shell(`am start -n ${APP}/.MainActivity`);
	const webview = await device.webView({ pkg: APP }, { timeout: 60_000 });
	const page = await webview.page();
	page.on("pageerror", (e) => console.log("  pageerror:", e.message));
	await page.evaluate(() => {
		history.pushState({}, "", "/people");
		dispatchEvent(new PopStateEvent("popstate"));
	});
	await page.getByTestId("active-person").waitFor({ timeout: 60_000 });
	return page;
}
async function kill() {
	await shell(`am force-stop ${APP}`);
	for (let i = 0; i < 20 && (await shell(`pidof ${APP}`)); i++) await new Promise((r) => setTimeout(r, 250));
	assert.equal(await shell(`pidof ${APP}`), "", "process is dead");
}

let passed = 0;
const step = (n) => console.log(`✔ ${n} (${++passed})`);
try {
	await shell(`pm clear ${APP}`);
	let page = await start();
	assert.equal(await page.getByTestId("active-person").innerText(), "Guest");
	for (const name of ["Ann R", "Ben R", "Cy R"]) await addPerson(page, name);
	await switchTo(page, "Ann R");
	await turnOn(page, "Ann");
	await switchTo(page, "Ben R");
	await turnOn(page, "Ben");
	assert.deepEqual(await directoryNames(page), ["Ann"]);
	step("android: local people + consented directory through native SQLite");

	await page.getByRole("button", { name: "Message Ann" }).click();
	await send(page, "native hello");
	await kill();
	page = await start();
	assert.equal(await page.getByTestId("active-person").innerText(), "Ben R");
	await switchTo(page, "Cy R");
	assert.equal(await page.getByTestId("conversation").count(), 0, "nonparticipant sees nothing");
	await switchTo(page, "Ann R");
	await page.getByTestId("conversation").click();
	await page.getByTestId("message").first().waitFor();
	assert.deepEqual(await bodies(page), ["native hello"]);
	step("android: message survives am force-stop, appears once for the recipient, hidden from others");
	console.log(`\nandroid-shared-device: ${passed} checks passed`);
} catch (error) {
	console.error("✖ android-shared-device failed:", error);
	process.exitCode = 1;
} finally {
	await device.close();
}
