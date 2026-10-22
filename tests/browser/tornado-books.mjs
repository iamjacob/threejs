// Real-Chrome check that /play shows the ACTIVE profile's books (npm run build:test first).
import assert from "node:assert/strict";
import { crash, freshProfile, launch, serveDist } from "./harness.mjs";
import { openPlay, probe } from "./mapPlayHelpers.mjs";
import { clearFileStore, countLegacy, frameTime, lib, PNG, refocus, seedLegacyScan, waitLib, waitSheet } from "./tornadoBooksHelpers.mjs";

const server = await serveDist(4322);
const dir = await freshProfile("/tmp/boooks-tornado-books");
let passed = 0;
const step = (n) => {
	passed++;
	console.log(`✔ ${n}`);
};
const open = (page, opts) => openPlay(page, server.origin, opts);

try {
	let { ctx, page } = await launch(dir);
	await open(page);
	await waitLib(page, /library is empty/);
	let p = await probe(page);
	assert.equal(p.booksMeshes, 0, "no book mesh for an empty library");
	assert.ok(p.webgl);
	step("empty library: tornado ring only, clear empty state, no book mesh");

	await page.evaluate(() => window.__boooksTest.addCatalogBooks(1));
	await page.reload();
	await open(page);
	await waitLib(page, /^1 book in your tornado/);
	await waitSheet(page, 1);
	const guestId = (await lib(page)).profileId;
	assert.deepEqual((await lib(page)).sources, ["atlas"], "bundled catalog cover");
	p = await probe(page);
	assert.equal(p.booksInstances, 1);
	assert.ok(p.booksMaxRadius > 8 && p.booksMaxHeight > 30, `book is placed on the spiral (r ${p.booksMaxRadius}, h ${p.booksMaxHeight})`);
	step("single explicitly-added catalog book renders with its bundled cover");

	await seedLegacyScan(page, { id: "scan-legacy-1", title: "My Scanned Book", author: "Me", cover: { front: PNG, back: PNG, spine: PNG }, dimensions: [0.4, 0.6, 0.05] });
	await page.reload();
	await open(page);
	await waitSheet(page, 2);
	assert.deepEqual((await lib(page)).sources, ["atlas", "file"], "scan cover from the FileStore, appended after");
	const guestOrder = (await lib(page)).ids;
	assert.equal(await countLegacy(page), 1, "original legacy record kept");
	await page.reload();
	await open(page);
	await waitSheet(page, 2);
	assert.deepEqual((await lib(page)).ids, guestOrder, "no duplicate import; same slots after reload");
	step("legacy scan imported into the guest, cover from FileStore, original kept; stable on reload");

	const accountId = await page.evaluate(() => window.__boooksTest.promoteToNewAccount("Ada"));
	await refocus(page);
	await waitSheet(page, 2, accountId);
	p = await probe(page);
	assert.ok(p.library.ids.every((id) => !id.startsWith(`${guestId}:`) && !guestOrder.includes(id)), "account's own rows only");
	assert.deepEqual(p.library.sources, ["atlas", "file"], "merged scan cover resolves via the account's file row");
	step("switch guest → account: tornado reloads with the account's (merged) books only");

	const freshGuest = await page.evaluate(() => window.__boooksTest.newGuest());
	await refocus(page);
	await waitLib(page, /library is empty/);
	await waitSheet(page, 0, freshGuest);
	p = await probe(page);
	assert.equal(p.booksMeshes, 0, "previous profile's books are gone from the scene");
	assert.equal(p.library.profileId, freshGuest);
	await page.evaluate((id) => window.__boooksTest.switchProfile(id), accountId);
	await refocus(page);
	await waitSheet(page, 2, accountId);
	assert.equal((await probe(page)).booksInstances, 2);
	step("switch to an empty profile clears the tornado; switching back restores the account's books");

	await ctx.setOffline(true);
	await page.reload();
	await open(page, { online: false });
	await waitSheet(page, 2, accountId);
	assert.deepEqual((await lib(page)).sources, ["atlas", "file"], "both covers available offline");
	await clearFileStore(page);
	await page.reload();
	await open(page, { online: false });
	await waitSheet(page, 2, accountId);
	assert.deepEqual((await lib(page)).sources, ["atlas", "fallback"], "missing cover file → metadata fallback");
	await ctx.setOffline(false);
	step("offline: local covers render; a missing cover file uses the deliberate fallback (no fetch)");

	await page.evaluate(() => window.__boooksTest.addCatalogBooks(100));
	await page.reload();
	await open(page);
	await waitLib(page, /books in your tornado/);
	const n = Number((await page.getByTestId("map-play-library").innerText()).match(/^(\d+)/)[1]);
	await waitSheet(page, n, accountId);
	p = await probe(page);
	assert.equal(p.booksMeshes, 1, "one instanced mesh");
	assert.equal(p.booksInstances, n);
	const ft = await frameTime(page);
	console.log(`  ${n} books: ${ft.frames} frames in 3 s, median ${ft.median.toFixed(1)} ms, p95 ${ft.p95.toFixed(1)} ms (headless SwiftShader)`);
	step(`larger library (${n} books, whole catalog) renders as one instanced draw`);

	// Beyond the catalog: a fresh guest with 150 synthetic scans through the real import path.
	const stressGuest = await page.evaluate(() => window.__boooksTest.newGuest());
	const imported = await page.evaluate((png) => window.__boooksTest.importSyntheticScans(150, png), PNG);
	assert.equal(imported, 150);
	await refocus(page);
	await waitLib(page, /^72 books in your tornado \(\+78 more\)/);
	await waitSheet(page, 72, stressGuest);
	p = await probe(page);
	assert.equal(p.booksMeshes, 1);
	assert.equal(p.booksInstances, 72, "capped at 72; the rest are counted in the HUD");
	assert.ok(p.booksMaxRadius > 8 && p.booksMaxHeight > 30, "instances placed on the spiral, not collapsed");
	const ft150 = await frameTime(page);
	console.log(`  150-book library (72 drawn): median ${ft150.median.toFixed(1)} ms, p95 ${ft150.p95.toFixed(1)} ms`);
	step("150-book library: 72 drawn in one instanced mesh, +78 counted in the HUD");
	await page.evaluate((id) => window.__boooksTest.switchProfile(id), accountId);
	await refocus(page);
	await waitSheet(page, n, accountId);

	const before = (await lib(page)).ids;
	await crash(ctx, dir);
	({ ctx, page } = await launch(dir));
	await open(page);
	await waitSheet(page, n, accountId);
	assert.deepEqual((await lib(page)).ids, before, "same books and slots after SIGKILL");
	step("after a browser SIGKILL the same library and slot order reload from SQLite");
	await ctx.close();
	console.log(`\ntornado-books: ${passed} checks passed`);
} catch (error) {
	console.error("✖ tornado-books failed:", error);
	process.exitCode = 1;
} finally {
	server.close();
}
