// Page helpers for tests/browser/book-files.mjs.
import assert from "node:assert/strict";
import { addPage, png } from "./bookManagerHelpers.mjs";

export const numbers = (page) => page.getByTestId("page-number").allInnerTexts();

/** "Import EPUB or PDF" → real <input type=file> chooser → state rights/source → Save. */
export async function importFile(page, file, rights = "public_domain", source = "Project Gutenberg") {
	const chooser = page.waitForEvent("filechooser", { timeout: 15_000 });
	await page.getByTestId("import-file").click();
	await (await chooser).setFiles(file);
	await page.getByTestId("import-rights").selectOption(rights);
	await page.getByTestId("import-source").fill(source);
	await page.getByTestId("import-save").click();
}

/** Three page images, the full-size viewer (open, next, end, Esc). */
export async function checkViewer(page) {
	for (const n of [1, 2, 3]) await addPage(page, png(n));
	await page.getByTestId("page").nth(2).waitFor({ timeout: 15_000 });
	assert.deepEqual(await numbers(page), ["Page 1", "Page 2", "Page 3"]);
	await page.getByTestId("page-open").nth(1).click();
	await page.getByTestId("viewer-image").waitFor({ timeout: 15_000 });
	assert.match(await page.getByTestId("viewer-page-number").innerText(), /Page 2/);
	await page.getByTestId("viewer-next").click();
	await page.getByTestId("viewer-page-number").filter({ hasText: "Page 3" }).waitFor();
	assert.ok(await page.getByTestId("viewer-next").isDisabled());
	await page.keyboard.press("Escape");
	await page.getByTestId("page-viewer").waitFor({ state: "detached" });
}

/** Renumber page 3 → 1 (swap prompt, confirm), page 2 → 5 (gap), then move the last page up. */
export async function checkNumbering(page) {
	await page.getByTestId("page-number-input").nth(2).fill("1");
	await page.getByTestId("page-number-save").nth(2).click();
	await page.getByTestId("page-swap-prompt").waitFor();
	assert.deepEqual(await numbers(page), ["Page 1", "Page 2", "Page 3"], "nothing changes before the swap is confirmed");
	const firstBefore = await page.getByTestId("page").first().locator("[title]").getAttribute("title");
	await page.getByTestId("page-swap-confirm").click();
	await page.waitForFunction((sha) => document.querySelector("[data-testid=page] [title]")?.getAttribute("title") !== sha, firstBefore, { timeout: 15_000 });
	await page.getByTestId("page-number-input").nth(1).fill("5");
	await page.getByTestId("page-number-save").nth(1).click();
	await page
		.getByTestId("page-issues")
		.filter({ hasText: "No scan yet for page 2, 4." })
		.waitFor({ timeout: 15_000 })
		.catch(async (e) => {
			const msg = await page.getByTestId("manager-message").allInnerTexts();
			throw new Error(`${e.message}\npages: ${await numbers(page)}\nmessage: ${msg}`);
		});
	assert.deepEqual(await numbers(page), ["Page 1", "Page 3", "Page 5"]);
	const lastSha = await page.getByTestId("page").nth(2).locator("[title]").getAttribute("title");
	await page.getByTestId("page-move-up").nth(2).click();
	await page.waitForFunction((sha) => document.querySelectorAll("[data-testid=page]")[1]?.querySelector("[title]")?.getAttribute("title") === sha, lastSha, { timeout: 15_000 });
	assert.deepEqual(await numbers(page), ["Page 1", "Page 3", "Page 5"], "a move trades numbers; the gap stays");
	return Promise.all([0, 1, 2].map((i) => page.getByTestId("page").nth(i).locator("[title]").getAttribute("title")));
}

/** Remove one file, check → cancel (nothing freed), check → confirm (exactly 1 item freed). */
export async function checkCleanup(page) {
	await page.getByTestId("remove-file").first().click();
	await page.getByTestId("confirm-remove-file").click();
	await page.waitForFunction(() => document.querySelectorAll("[data-testid=digital-file]").length === 1, null, { timeout: 15_000 });
	await page.getByTestId("cleanup-check").click();
	await page.getByTestId("cleanup-plan").filter({ hasText: "1 removed item" }).waitFor({ timeout: 15_000 });
	await page.getByTestId("cleanup-cancel").click();
	assert.equal(await page.getByTestId("cleanup-result").count(), 0, "cancel deletes nothing");
	await page.getByTestId("cleanup-check").click();
	await page.getByTestId("cleanup-confirm").click();
	await page.getByTestId("cleanup-result").filter({ hasText: "(1 item)" }).waitFor({ timeout: 15_000 });
	assert.equal(await page.getByTestId("status-local").innerText(), "Saved", "live pages and the other file intact");
	await page.getByTestId("cleanup-check").click();
	await page.getByTestId("cleanup-nothing").waitFor();
}
