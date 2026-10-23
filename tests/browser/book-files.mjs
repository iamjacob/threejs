// Real-Chrome checks of the local-only book-files slice on /library/:libraryBookId (built PWA).
// Offline guest: import EPUB + PDF through the real file input (rights stated), refuse a fake
// PDF, full-size page viewer, renumber with swap prompt, move, restart persistence, confirmed
// cleanup, and another person on the device sees none of it.
// Usage: npm run build && npm run test:book-files
import assert from "node:assert/strict";
import { epub, pdf } from "../book-files-helpers.mjs";
import { checkCleanup, checkNumbering, checkViewer, importFile, numbers } from "./bookFilesHelpers.mjs";
import { go, manager, png } from "./bookManagerHelpers.mjs";
import { BASE, freshProfile, launch, serveDist } from "./harness.mjs";
import { addPerson, openPeople, switchTo } from "./sharedDeviceHelpers.mjs";

const server = await serveDist(4324);
const dir = await freshProfile("/tmp/boooks-book-files");
let passed = 0;
const step = (n) => console.log(`✔ ${n} (${++passed})`);
const open = (page, p) => go(page, server.origin, p);
const PDF = { name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf("n")) };

try {
	let { ctx, page } = await launch(dir);
	const errors = [];
	const watch = (p) => p.on("pageerror", (e) => errors.push(e.message));
	watch(page);
	await open(page, "/library");
	await page.getByTestId("library-empty").or(page.getByTestId("library-list")).waitFor({ timeout: 60_000 });
	await ctx.setOffline(true);
	await page.getByTestId("new-title").fill("Meditations");
	await page.getByTestId("add-book").click();
	await manager(page).waitFor({ timeout: 30_000 });
	const bookId = (await page.getByTestId("manager-id").innerText()).trim();

	await importFile(page, { name: "meditations.epub", mimeType: "", buffer: Buffer.from(epub("m")) });
	await page.getByTestId("digital-file").first().waitFor({ timeout: 15_000 });
	await importFile(page, PDF, "own_work", "");
	await page.getByTestId("digital-file").nth(1).waitFor({ timeout: 15_000 });
	await importFile(page, PDF);
	await page.waitForTimeout(800);
	assert.equal(await page.getByTestId("digital-file").count(), 2, "the same file twice is one file");
	const rights = await page.getByTestId("file-rights").allInnerTexts();
	assert.ok(rights.some((t) => t.includes("Public domain") && t.includes("Project Gutenberg")), rights.join(" | "));
	assert.deepEqual(await page.getByTestId("file-state").allInnerTexts(), ["Saved and checked on this device", "Saved and checked on this device"]);
	assert.equal(await page.getByTestId("status-sync").innerText(), "Local only · sync not configured");
	step("offline: EPUB (no MIME from the picker) + PDF imported with rights/source; duplicate ignored; local only");

	await importFile(page, { name: "fake.pdf", mimeType: "application/pdf", buffer: png(1).buffer });
	await page.getByTestId("manager-message").filter({ hasText: "not an EPUB or a PDF" }).waitFor({ timeout: 15_000 });
	await page.getByTestId("import-form").getByRole("button", { name: "Cancel" }).click();
	assert.equal(await page.getByTestId("digital-file").count(), 2);
	step("a PNG named .pdf is refused from its bytes, with a clear message; nothing added");

	await checkViewer(page);
	step("full-size page viewer opens from the thumbnail, pages next, end disabled, Esc closes");

	const order = await checkNumbering(page);
	step("renumber asks before swapping; gaps reported as missing; move trades numbers");

	await ctx.close();
	({ ctx, page } = await launch(dir));
	watch(page);
	await open(page, `/library/${bookId}`);
	await manager(page).waitFor({ timeout: 60_000 });
	assert.deepEqual(await numbers(page), ["Page 1", "Page 3", "Page 5"]);
	const after = await Promise.all([0, 1, 2].map((i) => page.getByTestId("page").nth(i).locator("[title]").getAttribute("title")));
	assert.deepEqual(after, order, "same scans in the same order after restart");
	assert.equal(await page.getByTestId("digital-file").count(), 2);
	step("restart: page numbers, order and both files persist");

	await checkCleanup(page);
	step("cleanup: check → cancel keeps everything; confirm frees exactly the removed file; live content intact");

	await openPeople(page, server.origin, BASE);
	await addPerson(page, "Ben");
	await switchTo(page, "Ben");
	await open(page, `/library/${bookId}`);
	await page.getByTestId("manager-not-found").waitFor({ timeout: 30_000 });
	const body = await page.locator("body").innerText();
	assert.ok(!body.includes("meditations.epub") && !body.includes("notes.pdf"), "no trace of the guest's files");
	await openPeople(page, server.origin, BASE);
	await switchTo(page, "Guest");
	await open(page, `/library/${bookId}`);
	await manager(page).waitFor({ timeout: 30_000 });
	assert.equal(await page.getByTestId("digital-file").count(), 1);
	step("profile isolation: Ben cannot open the guest's book or see its files; the guest still has them");

	assert.deepEqual(errors, [], "no page errors");
	await ctx.close();
	console.log(`\nbook-files: ${passed} checks passed`);
} catch (error) {
	console.error("✖ book-files failed:", error);
	process.exitCode = 1;
} finally {
	server.close();
}
