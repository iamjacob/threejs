// Second half of tests/browser/book-routes.mjs: local scan offline, profile isolation, People link.
import assert from "node:assert/strict";
import { BASE } from "./harness.mjs";
import {
	card, controller, go, pathOf, SCAN, scanSeen, seedScan, SENECA, titleText, watchScanTitle,
} from "./bookRoutesHelpers.mjs";
import { controllerAction, swReady } from "./routesHelpers.mjs";
import { addPerson, openPeople, switchTo } from "./sharedDeviceHelpers.mjs";
import { PNG } from "./tornadoBooksHelpers.mjs";

/**
 * The reader really opened the book: Foliate laid out at least one page section, and the app got
 * `reader-ready` (it removes its own "Opening book…" status only then; errors show a message).
 */
async function readerShowsPages(page) {
	await page.frameLocator("dialog[open] iframe").locator("#pages section").first().waitFor({ timeout: 30_000 });
	const status = page.locator("dialog[open] output");
	await status.waitFor({ state: "detached", timeout: 30_000 });
}
const pages = (page) => ({ waitFor: () => readerShowsPages(page) });

export async function checkScanOfflineIsolationPeople({ ctx, page, server, step }) {
	await seedScan(page, PNG);
	await go(page, server.origin, `/book/${SCAN}`);
	await card(page).waitFor({ timeout: 60_000 });
	assert.equal(await titleText(page), "My Route Scan");
	if (await swReady(page)) {
		// Open the reader once online (as a person would), so its own files are cached.
		await go(page, server.origin, `/read/${SCAN}`);
		await pages(page).waitFor({ timeout: 30_000 });
		await ctx.setOffline(true);
		await page.reload();
		await pages(page).waitFor({ timeout: 30_000 });
		await go(page, server.origin, `/book/${SCAN}`);
		await card(page).waitFor({ timeout: 60_000 });
		await ctx.setOffline(false);
		step("offline reload: a local scan's /read/:id shows its scanned pages; /book/:id shows its card");
	} else console.log("! service worker not active; offline reload NOT checked");

	await openPeople(page, server.origin, BASE);
	await addPerson(page, "Ben");
	await switchTo(page, "Ben");
	for (const p of [`/book/${SCAN}`, `/read/${SCAN}`]) {
		await go(page, server.origin, p);
		await watchScanTitle(page);
		await page.getByTestId("book-route-missing").waitFor({ timeout: 60_000 });
		assert.equal(await card(page).count(), 0);
		assert.equal(await scanSeen(page), 0, "the scan's title never appeared for Ben");
	}
	await go(page, server.origin, `/book/${SENECA}`);
	await card(page).waitFor({ timeout: 60_000 });
	await openPeople(page, server.origin, BASE);
	await switchTo(page, "Guest");
	await go(page, server.origin, `/book/${SCAN}`);
	await card(page).waitFor({ timeout: 60_000 });
	step("profile isolation: Ben gets 'Book not found' for the guest's scan; catalog opens; the guest still can");

	await go(page, server.origin, "/");
	await controller(page).waitFor({ timeout: 120_000 });
	await controllerAction(page, "People & messages");
	await page.getByTestId("active-person").waitFor({ timeout: 30_000 });
	assert.equal(pathOf(page), "/people");
	assert.equal(await page.getByText("Freja Lindqvist").count(), 0, "sample friends are gone");
	await go(page, server.origin, "/profile");
	await page
		.getByRole("navigation", { name: "Profile pages" })
		.getByRole("link", { name: /^People & messages/ })
		.click();
	await page.getByTestId("active-person").waitFor({ timeout: 30_000 });
	step("joystick 'People & messages' and the Profile link open the real /people page; no sample friends");
}
