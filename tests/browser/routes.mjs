// Real-Chrome route + navigation checks on the built PWA (not part of `node --test`).
// Direct entry/reload of every live route, not-found (incl. the removed /play), shell links,
// Back/Forward (Library ⇄ scanner, shelves ⇄ Maps), no cross-profile flash on /profile, offline
// reload, world-transition failure + repeated taps, reduced motion, touch targets and focus.
// Usage: npm run build && npm run test:routes   (CHROME_PATH overrides the browser)
import assert from "node:assert/strict";
import { BASE, freshProfile, launch, serveDist } from "./harness.mjs";
import { checkFailureAndMotion, checkProfileOfflineMobile } from "./routesChecks.mjs";
import { controller, controllerAction, overlay, pathOf, READY, url, waitReady } from "./routesHelpers.mjs";

const server = await serveDist(4321);
const dir = await freshProfile("/tmp/boooks-routes-profile");
let passed = 0;
const step = (name) => {
	passed++;
	console.log(`✔ ${name}`);
};
const LIVE = Object.keys(READY);

try {
	const { ctx, page } = await launch(dir);
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));

	for (const path of LIVE) {
		await page.goto(url(server.origin, path));
		await waitReady(page, path);
		await page.reload();
		await waitReady(page, path);
		assert.equal(pathOf(page), path);
	}
	step(`direct entry and reload render each live route: ${LIVE.join(" ")}`);

	for (const path of ["/play", "/nope/deep/link", "/discover", "/privacy"]) {
		await page.goto(url(server.origin, path));
		await page.getByTestId("not-found").waitFor({ timeout: 30_000 });
		await page.getByRole("link", { name: "Go to your Library" }).click();
		await controller(page).waitFor({ timeout: 120_000 });
		assert.equal(pathOf(page), "/");
	}
	step("/play, unknown and not-yet-built paths show not-found with a working way back to Library");

	await page.goto(url(server.origin, "/more"));
	await waitReady(page, "/more");
	const hrefs = await page.locator("a[href]").evaluateAll((as) => [...new Set(as.map((a) => new URL(a.href).pathname))]);
	assert.ok(hrefs.length >= 6, `links found: ${hrefs}`);
	for (const href of hrefs) {
		assert.ok(href.startsWith(BASE), `${href} stays inside the app`);
		assert.ok(LIVE.includes(href.slice(BASE.length - 1) || "/"), `${href} is a live route`);
	}
	assert.deepEqual(
		await page.getByTestId("giga-footer").getByRole("link").allInnerTexts(),
		["Library", "Scan", "Maps", "Notes", "Your library", "People & messages"],
		"desktop GIGA footer groups",
	);
	assert.equal(await page.getByTestId("more-pending").getByRole("link").count(), 0, "planned pages are not links");
	for (const [name, target] of [["Profile", "/profile"], ["Notes", "/notes"], ["People & messages", "/people"]]) {
		await page.goto(url(server.origin, "/more"));
		await waitReady(page, "/more");
		await page.getByRole("link", { name, exact: true }).first().click();
		await waitReady(page, target);
		assert.equal(pathOf(page), target);
	}
	step(`all ${hrefs.length} shell links are live routes; footer groups match; planned pages unlinked; clicks land`);

	await page.goto(url(server.origin, "/"));
	await controller(page).waitFor({ timeout: 120_000 });
	await page.getByRole("button", { name: "Scan a book" }).first().click();
	await waitReady(page, "/scan");
	await page.goBack();
	await page.locator("#book-scanner").waitFor({ state: "detached", timeout: 10_000 });
	assert.equal(pathOf(page), "/");
	await page.goForward();
	await waitReady(page, "/scan");
	await page.getByRole("button", { name: "Close scanner and go to the shelf" }).click();
	await page.locator("#book-scanner").waitFor({ state: "detached", timeout: 10_000 });
	assert.equal(pathOf(page), "/");
	step("Library → /scan → Back closes the scanner → Forward reopens → Close returns to /");

	await controller(page).waitFor({ timeout: 60_000 });
	// The router's own history index (history.length is capped when pushing over forward entries).
	const index = () => page.evaluate(() => history.state?.__TSR_index);
	const before = await index();
	await controllerAction(page, "Open map");
	await overlay(page).waitFor({ timeout: 2_000 });
	// Repeated taps while covered: the overlay sits on top, and go() ignores re-entry.
	await page.mouse.click(60, 60);
	await page.evaluate(() => window.dispatchEvent(new Event("focus")));
	await waitReady(page, "/maps");
	await overlay(page).waitFor({ state: "detached", timeout: 30_000 });
	assert.equal(await index(), before + 1, "exactly one history entry");
	await page.goBack();
	await controller(page).waitFor({ timeout: 120_000 });
	assert.equal(pathOf(page), "/");
	await page.goForward();
	await waitReady(page, "/maps");
	assert.equal(await overlay(page).count(), 0, "history moves never leave the overlay up");
	step("shelves → Maps (one history entry despite extra taps) → Back → Forward, overlay never stuck");

	await controllerAction(page, "Shelves");
	await page.waitForURL((u) => !u.pathname.endsWith("/maps"), { timeout: 10_000 });
	await page.goBack();
	await overlay(page).waitFor({ state: "detached", timeout: 3_000 });
	await waitReady(page, "/maps");
	step("browser Back during a world transition drops the overlay immediately");

	await checkProfileOfflineMobile({ ctx, page, server, step });
	assert.deepEqual(errors, [], "no page errors");
	await ctx.close();

	await checkFailureAndMotion({ server, step });
	console.log(`\nroutes: ${passed} checks passed`);
} catch (error) {
	console.error("✖ routes failed:", error);
	process.exitCode = 1;
} finally {
	server.close();
}
