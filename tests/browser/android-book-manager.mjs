// /library and /library/:libraryBookId in the Capacitor Android WebView (native SQLite + native
// Filesystem FileStore). The OS photo picker is not driven: page bytes go through the SAME use case
// via a test-hooks-only entry point (picker skipped), so native storage and integrity are real.
// Usage: VITE_BOOOKS_TEST_HOOKS=1 npm run cap:sync, build + install the APK, then run this.
import assert from "node:assert/strict";
import { _android as android } from "playwright-core";
import { epub } from "../book-files-helpers.mjs";

const EPUB = [...epub("android")];

const APP = "me.jacobg.boooks";
const [device] = await android.devices();
assert.ok(device, "an adb device/emulator is connected");
const shell = async (c) => (await device.shell(c)).toString().trim();
let passed = 0;
const step = (n) => console.log(`✔ ${n} (${++passed})`);
const ONE_PX = [...Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")];
const go = (page, p) =>
	page.evaluate((to) => {
		history.pushState({ ...history.state, __TSR_index: (history.state?.__TSR_index ?? 0) + 1 }, "", to);
		dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
	}, p);
const content = (page) => page.getByTestId("status-content");

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
	await shell("cmd connectivity airplane-mode enable");
	await go(page, "/library");
	await page.getByTestId("library-empty").or(page.getByTestId("library-list")).waitFor({ timeout: 60_000 });
	await page.getByTestId("new-title").fill("Android Notes");
	await page.getByTestId("add-book").click();
	await page.getByTestId("book-manager").waitFor({ timeout: 30_000 });
	const bookId = (await page.getByTestId("manager-id").innerText()).trim();
	assert.equal(await page.getByTestId("status-sync").innerText(), "Local only · sync not configured");
	await page.getByTestId("meta-pages").fill("2");
	await page.getByTestId("meta-save").click();
	await page.getByTestId("meta-saved").waitFor();
	for (const n of [1, 2])
		assert.equal(await page.evaluate(([b, n]) => window.__boooksBookManagerTest.addPage([...b, ...new Array(n).fill(0)], "image/png"), [ONE_PX, n]), true);
	await content(page).filter({ hasText: "All 2 pages" }).waitFor({ timeout: 30_000 });
	step("airplane mode: guest adds a book, sets 2 pages, 2 page images saved to native storage → complete");

	await shell(`am force-stop ${APP}`);
	page = await launch();
	await go(page, `/library/${bookId}`);
	await page.getByTestId("book-manager").waitFor({ timeout: 60_000 });
	assert.equal(await page.getByTestId("page").count(), 2);
	assert.equal(await content(page).getAttribute("data-kind"), "complete");
	assert.equal(await page.getByText("Saved and checked on this device").count(), 2, "bytes present in native file storage");
	step("am force-stop + relaunch: /library/:id opens directly; both pages present and checked");

	// Book files + page tools (0005 slice) on native SQLite + native Filesystem, still offline.
	assert.equal(await page.evaluate(([b]) => window.__boooksBookManagerTest.importFile(b, "a.epub"), [EPUB]), true);
	assert.equal(await page.evaluate(([b]) => window.__boooksBookManagerTest.importFile(b, "a.epub"), [EPUB]), true);
	assert.equal(await page.evaluate(([b]) => window.__boooksBookManagerTest.importFile(b, "fake.pdf"), [ONE_PX]), false, "a PNG is not a book file");
	await page.getByTestId("digital-file").first().waitFor({ timeout: 30_000 });
	assert.equal(await page.getByTestId("digital-file").count(), 1, "retry keeps one file");
	await page.getByTestId("page-number-input").nth(1).fill("4");
	await page.getByTestId("page-number-save").nth(1).click();
	await page.getByTestId("page-issues").filter({ hasText: "2, 3" }).waitFor({ timeout: 30_000 });
	await shell(`am force-stop ${APP}`);
	page = await launch();
	await go(page, `/library/${bookId}`);
	await page.getByTestId("book-manager").waitFor({ timeout: 60_000 });
	assert.deepEqual(await page.getByTestId("page-number").allInnerTexts(), ["Page 1", "Page 4"]);
	assert.equal(await page.getByTestId("file-state").innerText(), "Saved and checked on this device");
	step("EPUB import (idempotent, fake refused) + renumber persist across force-stop on native storage");

	await go(page, "/library/not-a-real-id");
	await page.getByTestId("manager-not-found").waitFor({ timeout: 30_000 });
	step("unknown library id → 'not in the library' state");
	console.log(`\nandroid-book-manager: ${passed} checks passed`);
} catch (error) {
	console.error("✖ android-book-manager failed:", error);
	process.exitCode = 1;
} finally {
	await shell("cmd connectivity airplane-mode disable").catch(() => {});
	await device.close();
}
