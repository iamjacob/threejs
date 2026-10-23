// /book/:id and /read/:id inside the Capacitor Android WebView (emulator or device), native SQLite.
// Usage: npm run test:android:book-routes   (needs an emulator/device, JDK 21 as JAVA_HOME)
import assert from "node:assert/strict";
import { _android as android } from "playwright-core";
import { SCAN, seedScan } from "./bookRoutesHelpers.mjs";
import { PNG } from "./tornadoBooksHelpers.mjs";

const APP = "me.jacobg.boooks";
const SENECA = "978-0-141-01881-2";
const READABLE = "9788797248003";
const [device] = await android.devices();
assert.ok(device, "an adb device/emulator is connected");
const shell = async (c) => (await device.shell(c)).toString().trim();
let passed = 0;
const step = (n) => console.log(`✔ ${n} (${++passed})`);

const card = (page) => page.getByRole("region", { name: "Book information" });
const reader = (page) => page.locator("dialog[open][aria-label^='Read ']");
const path = (page) => page.evaluate(() => decodeURIComponent(location.pathname));
const waitPath = (page, p) =>
	page.waitForFunction((want) => decodeURIComponent(location.pathname) === want, p, { timeout: 30_000 });
/** In-app navigation, as a link tap does (the WebView has no address bar). */
const go = (page, p) =>
	page.evaluate((to) => {
		history.pushState({ ...history.state, __TSR_index: (history.state?.__TSR_index ?? 0) + 1 }, "", to);
		dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
	}, p);

async function launch() {
	await shell(`am start -n ${APP}/.MainActivity`);
	const page = await (await device.webView({ pkg: APP }, { timeout: 60_000 })).page();
	page.on("pageerror", (e) => console.log("  pageerror:", e.message));
	await page.locator(".bc-btn").first().waitFor({ timeout: 120_000 });
	return page;
}

try {
	await shell(`pm clear ${APP}`);
	let page = await launch();

	// A guest-owned scan with photographed pages (Foliate's scanned-page renderer, no PDF.js).
	await seedScan(page, PNG);
	await shell(`am force-stop ${APP}`);
	page = await launch();

	await go(page, `/book/${SENECA}`);
	await card(page).waitFor({ timeout: 60_000 });
	assert.equal(await path(page), `/book/${SENECA}`);
	await go(page, `/read/${SCAN}`);
	await reader(page).waitFor({ timeout: 60_000 });
	await page.frameLocator("dialog[open] iframe").locator("#pages section").first().waitFor({ timeout: 90_000 });
	await page.locator("dialog[open] output").waitFor({ state: "detached", timeout: 60_000 });
	step("WebView: /book/:id opens the card; /read/:id opens Foliate with a scan's pages (native SQLite)");

	// Known, pre-existing: catalog PDFs fail on this WebView (PDF.js 5.5 needs Uint8Array#toHex, Chrome ≥ 140).
	// The route still opens the reader dialog and surfaces the reader's own error + Retry, never a blank page.
	await go(page, `/read/${READABLE}`);
	await reader(page).waitFor({ timeout: 60_000 });
	const status = page.locator("dialog[open] output");
	const pdfOpened = await page
		.frameLocator("dialog[open] iframe")
		.locator("#pages section")
		.first()
		.waitFor({ timeout: 45_000 })
		.then(() => true)
		.catch(() => false);
	if (!pdfOpened) {
		await status.filter({ hasText: "could not be opened" }).waitFor({ timeout: 15_000 });
		assert.ok(await status.getByRole("button", { name: "Retry" }).isVisible());
		console.log("! catalog PDF did not open on this WebView (pre-existing PDF.js/WebView gap); error + Retry shown");
	}
	await page.getByRole("button", { name: "Close reader" }).click();
	await waitPath(page, `/book/${READABLE}`);
	await go(page, `/read/${SCAN}`);
	await reader(page).waitFor({ timeout: 60_000 });

	await page.goBack();
	await reader(page).waitFor({ state: "detached", timeout: 30_000 });
	await waitPath(page, `/book/${READABLE}`);
	await card(page).waitFor();
	await page.goForward();
	await reader(page).waitFor({ timeout: 60_000 });
	await page.getByRole("button", { name: "Close reader" }).click();
	await waitPath(page, `/book/${SCAN}`);
	await card(page).waitFor();
	step("WebView history: Back from the reader → previous page; Forward → reader; Close reader → its card");

	await go(page, "/book/no-such-book");
	await page.getByTestId("book-route-missing").waitFor({ timeout: 30_000 });
	assert.equal(await card(page).count(), 0);
	await go(page, `/read/${SENECA}`);
	await page.getByTestId("book-route-unreadable").waitFor({ timeout: 30_000 });
	assert.equal(await reader(page).count(), 0);
	step("WebView: unknown id → 'Book not found'; no file → card + 'Nothing to read'");

	await go(page, `/read/${SCAN}`);
	await reader(page).waitFor({ timeout: 60_000 });
	await page.reload();
	await reader(page).waitFor({ timeout: 120_000 });
	assert.equal(await path(page), `/read/${SCAN}`);
	await shell(`am force-stop ${APP}`);
	page = await launch();
	await go(page, `/book/${SENECA}`);
	await card(page).waitFor({ timeout: 60_000 });
	step("WebView reload of /read/:id reopens the reader; app relaunch + /book/:id works");

	// Offline (airplane mode): a local scan still opens by URL; assets are in the APK.
	await shell("cmd connectivity airplane-mode enable");
	try {
		await go(page, `/read/${SCAN}`);
		await reader(page).waitFor({ timeout: 60_000 });
		await page.frameLocator("dialog[open] iframe").locator("#pages section").first().waitFor({ timeout: 60_000 });
		step("WebView offline (airplane mode): /read/:id of a local scan opens its pages");
	} finally {
		await shell("cmd connectivity airplane-mode disable");
	}

	console.log(`\nandroid-book-routes: ${passed} checks passed`);
} catch (error) {
	console.error("✖ android-book-routes failed:", error);
	process.exitCode = 1;
} finally {
	// The adb connection keeps Node alive; close it so the script (and npm run) exits.
	await shell("cmd connectivity airplane-mode disable").catch(() => {});
	await device.close();
}
