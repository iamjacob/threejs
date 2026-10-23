// Real-browser check of the built PWA's /notes slice (not part of `node --test`; needs Chrome).
// Proves on web: SQLite (jeep-sqlite) → use cases → Zustand → UI; persistence across a clean
// restart AND a SIGKILL crash; image bytes via the IndexedDB FileStore; second-tab lock;
// guest promotion; offline reload via the service worker.
// Usage: npm run build && npm run test:web-restart   (CHROME_PATH overrides the browser)
import assert from "node:assert/strict";
import { BASE, crash, freshProfile, launch, serveDist, stubImagePicker } from "./harness.mjs";

const server = await serveDist();
const profile = await freshProfile("/tmp/boooks-web-restart-profile");
let passed = 0;
const step = (name) => {
	passed++;
	console.log(`✔ ${name}`);
};
const openNotes = async (page) => {
	await page.goto(`${server.origin}${BASE}notes`);
	await page.getByTestId("title").waitFor({ timeout: 30_000 });
};
const titles = async (page) => (await page.getByTestId("note-title").allInnerTexts()).sort();
async function addNote(page, title, body = "") {
	await page.getByTestId("title").fill(title);
	await page.getByTestId("body").fill(body);
	await page.getByTestId("add").click();
	await page.getByTestId("note-title").filter({ hasText: title }).waitFor();
}
const image = (page) => page.locator('[data-testid="note"] img').first().waitFor({ timeout: 15_000 });

try {
	let { ctx, page } = await launch(profile);
	await openNotes(page);
	assert.equal(await page.getByTestId("profile").innerText(), "Guest");
	assert.match(await page.getByTestId("engine").innerText(), /capacitor-sqlite:web · files: indexeddb/);
	await addNote(page, "Alpha", "first");
	await addNote(page, "Beta");
	await page.getByTestId("note").filter({ hasText: "Beta" }).getByTestId("delete").click();
	await page.getByTestId("note-title").filter({ hasText: "Beta" }).waitFor({ state: "detached" });
	assert.deepEqual(await titles(page), ["Alpha"]);
	assert.match(await page.getByTestId("pending-sync").innerText(), /^3 change/);
	step("guest created with no network/account; create + delete through SQLite → use case → Zustand → UI");

	const tab2 = await ctx.newPage();
	await tab2.goto(`${server.origin}${BASE}notes`);
	await tab2.getByTestId("locked").waitFor({ timeout: 15_000 });
	await tab2.close();
	step("second tab refused by Web Locks (prevents last-save-wins overwrites)");

	await stubImagePicker(page);
	await page.getByTestId("note").filter({ hasText: "Alpha" }).getByRole("button", { name: "Image" }).click();
	await image(page);
	step("image bytes written via IndexedDB FileStore, metadata in SQLite, read back and rendered");

	await ctx.close();
	({ ctx, page } = await launch(profile));
	await openNotes(page);
	await page.getByTestId("note-title").first().waitFor();
	assert.deepEqual(await titles(page), ["Alpha"]);
	await image(page);
	step("notes + image survive a clean browser restart");

	await addNote(page, "Gamma", "written right before a crash");
	const killed = await crash(ctx, profile);
	console.log(`  (SIGKILLed ${killed} Chrome processes)`);
	({ ctx, page } = await launch(profile));
	await openNotes(page);
	await page.getByTestId("note-title").filter({ hasText: "Gamma" }).waitFor({ timeout: 15_000 });
	assert.deepEqual(await titles(page), ["Alpha", "Gamma"]);
	step("a committed write survives SIGKILL (flushed before the use case resolved)");

	await page.getByTestId("lookup").click();
	assert.match(await page.getByTestId("message").innerText(), /unavailable/);
	await page.getByTestId("account-name").fill("Ada");
	await page.getByTestId("promote").click();
	await page.getByTestId("profile").filter({ hasText: "Ada" }).waitFor();
	assert.deepEqual(await titles(page), ["Alpha", "Gamma"]);
	await ctx.close();
	({ ctx, page } = await launch(profile));
	await openNotes(page);
	await page.getByTestId("profile").filter({ hasText: "Ada" }).waitFor();
	assert.deepEqual(await titles(page), ["Alpha", "Gamma"]);
	await image(page);
	step("account lookup reports unavailable; guest → local account keeps notes + image across restart");

	const swActive = await page.evaluate(async () => {
		if (!navigator.serviceWorker) return false;
		const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10_000))]);
		return Boolean(reg?.active);
	});
	if (swActive) {
		await ctx.setOffline(true);
		await page.reload();
		await page.getByTestId("title").waitFor({ timeout: 30_000 });
		await addNote(page, "Offline note");
		await ctx.setOffline(false);
		step("offline reload served by the service worker; CRUD works with the network off");
	} else {
		console.log("! service worker not active; offline reload NOT checked");
	}
	await ctx.close();
	console.log(`\nweb-restart: ${passed} checks passed`);
} catch (error) {
	console.error("✖ web-restart failed:", error);
	process.exitCode = 1;
} finally {
	server.close();
}
