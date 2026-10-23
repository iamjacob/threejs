// Real-Chrome checks of /library and /library/:libraryBookId (built PWA; not part of node --test).
// Guest + offline: add a book, edit details, add page images through the real file input, honest
// status; restart, SIGKILL, direct link, remove/restore, profile isolation, no Fetch button.
// Usage: npm run build && npm run test:book-manager
import assert from "node:assert/strict";
import { addPage, content, go, manager, png } from "./bookManagerHelpers.mjs";
import { BASE, crash, freshProfile, launch, serveDist } from "./harness.mjs";
import { addPerson, openPeople, switchTo } from "./sharedDeviceHelpers.mjs";

const server = await serveDist(4323);
const dir = await freshProfile("/tmp/boooks-book-manager");
let passed = 0;
const step = (n) => {
	passed++;
	console.log(`✔ ${n}`);
};
const open = (page, p) => go(page, server.origin, p);

try {
	let { ctx, page } = await launch(dir);
	const errors = [];
	const watch = (p) => p.on("pageerror", (e) => errors.push(e.message));
	watch(page);
	await open(page, "/library");
	await page.getByTestId("library-empty").or(page.getByTestId("library-list")).waitFor({ timeout: 60_000 });
	await ctx.setOffline(true);
	await page.getByTestId("new-title").fill("Field Notes");
	await page.getByTestId("new-author").fill("Ada");
	await page.getByTestId("add-book").click();
	await manager(page).waitFor({ timeout: 30_000 });
	const bookId = (await page.getByTestId("manager-id").innerText()).trim();
	assert.ok(decodeURIComponent(new URL(page.url()).pathname).endsWith(`/library/${bookId}`));
	assert.equal(await page.getByTestId("status-sync").innerText(), "Local only · sync not configured");
	assert.equal(await content(page).getAttribute("data-kind"), "none");
	assert.equal(await page.getByTestId("status-registration").innerText(), "Not proposed");
	assert.equal(await page.getByTestId("status-chain").innerText(), "Not submitted");
	assert.equal(await page.getByRole("button", { name: /fetch/i }).count(), 0, "no Fetch button");
	await page.getByTestId("no-fetch-note").waitFor();
	step("guest, offline: add a book → stable /library/:id; 'Local only · sync not configured'; no Fetch button");

	await page.getByTestId("meta-subtitle").fill("Volume one");
	await page.getByTestId("meta-pages").fill("2");
	await page.getByTestId("meta-save").click();
	await page.getByTestId("meta-saved").waitFor();
	await addPage(page, png(1));
	await content(page).filter({ hasText: "1 of 2 pages" }).waitFor({ timeout: 15_000 });
	assert.equal(await content(page).getAttribute("data-kind"), "partial");
	await addPage(page, png(1));
	await page.waitForTimeout(800);
	assert.equal(await page.getByTestId("page").count(), 1, "the same image twice is one page");
	await addPage(page, png(2));
	await content(page).filter({ hasText: "All 2 pages" }).waitFor({ timeout: 15_000 });
	assert.deepEqual(await page.getByTestId("page-number").allInnerTexts(), ["Page 1", "Page 2"]);
	step("offline: details saved; pages via the real file picker; partial → complete only at 2/2; duplicate ignored");

	await addPage(page, { name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
	await page.getByTestId("manager-message").filter({ hasText: "not supported" }).waitFor({ timeout: 15_000 });
	assert.equal(await page.getByTestId("page").count(), 2);
	step("a PDF picked as a page is refused with a clear message; nothing changes");

	await ctx.close();
	({ ctx, page } = await launch(dir));
	watch(page);
	await open(page, `/library/${bookId}`);
	await manager(page).waitFor({ timeout: 60_000 });
	assert.equal(await page.getByTestId("meta-subtitle").inputValue(), "Volume one");
	assert.equal(await page.getByTestId("page").count(), 2);
	assert.equal(await content(page).getAttribute("data-kind"), "complete");
	await crash(ctx, dir);
	({ ctx, page } = await launch(dir));
	watch(page);
	await open(page, `/library/${bookId}`);
	await manager(page).waitFor({ timeout: 60_000 });
	assert.equal(await page.getByTestId("page").count(), 2);
	step("restart and SIGKILL: /library/:id opens directly with the same details and both checked pages");

	await page.getByTestId("remove-page").first().click();
	await page.getByTestId("confirm-remove").click();
	await content(page).filter({ hasText: "1 of 2" }).waitFor({ timeout: 15_000 });
	await addPage(page, png(1));
	await content(page).filter({ hasText: "All 2 pages" }).waitFor({ timeout: 15_000 });
	step("remove asks for confirmation; re-adding the same image restores the page");

	await openPeople(page, server.origin, BASE);
	await addPerson(page, "Ben");
	await switchTo(page, "Ben");
	await open(page, `/library/${bookId}`);
	await page.getByTestId("manager-not-found").waitFor({ timeout: 30_000 });
	assert.ok(!(await page.locator("body").innerText()).includes("Volume one"), "no trace of the guest's details");
	await open(page, "/library");
	await page.getByTestId("library-empty").waitFor({ timeout: 30_000 });
	await openPeople(page, server.origin, BASE);
	await switchTo(page, "Guest");
	await open(page, `/library/${bookId}`);
	await manager(page).waitFor({ timeout: 30_000 });
	step("profile isolation: Ben gets 'not in the library' and an empty list; the guest still has the book");

	assert.deepEqual(errors, [], "no page errors");
	await ctx.close();
	console.log(`\nbook-manager: ${passed} checks passed`);
} catch (error) {
	console.error("✖ book-manager failed:", error);
	process.exitCode = 1;
} finally {
	server.close();
}
