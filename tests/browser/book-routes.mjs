// Real-Chrome checks for /book/:bookId and /read/:bookId over the shelves (not part of node --test).
// Direct entry + refresh, scene taps ⇄ URL, Back/Forward (Library → book → reader), real
// not-found / unreadable states, offline reload of a local scan's card + reader, profile isolation
// of scans, and that Messages now leads to the real /people page.
// Usage: npm run build && npm run test:book-routes   (CHROME_PATH overrides the browser)
import assert from "node:assert/strict";
import { freshProfile, launch, serveDist } from "./harness.mjs";
import { checkScanOfflineIsolationPeople } from "./bookRoutesChecks.mjs";
import {
	card, controller, go, pathOf, READABLE, reader, SENECA, shelvesUp, titleText, waitPath,
} from "./bookRoutesHelpers.mjs";

const server = await serveDist(4322);
const dir = await freshProfile("/tmp/boooks-book-routes-profile");
let passed = 0;
const step = (name) => {
	passed++;
	console.log(`✔ ${name}`);
};
const at = (page, p) => waitPath(page, p);
const foliate = (page) => page.frameLocator("dialog[open] iframe").locator("#pages");

try {
	const { ctx, page } = await launch(dir);
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));

	for (let i = 0; i < 2; i++) {
		if (i === 0) await go(page, server.origin, `/book/${SENECA}`);
		else await page.reload();
		await shelvesUp(page);
		await card(page).waitFor({ timeout: 60_000 });
		assert.equal(await titleText(page), "Seneca");
		assert.equal(pathOf(page), `/book/${SENECA}`);
	}
	for (let i = 0; i < 2; i++) {
		if (i === 0) await go(page, server.origin, `/read/${READABLE}`);
		else await page.reload();
		await reader(page).waitFor({ timeout: 60_000 });
		await foliate(page).waitFor({ timeout: 30_000 });
		assert.equal(pathOf(page), `/read/${READABLE}`);
	}
	step("direct entry and refresh: /book/:id opens the card, /read/:id opens the Foliate reader");

	await page.getByRole("button", { name: "Close reader" }).click();
	await at(page, `/book/${READABLE}`);
	await card(page).waitFor();
	await page.getByRole("button", { name: /Back to shelf|Close book and return to shelf/ }).click();
	await at(page, "/");
	await controller(page).waitFor({ timeout: 60_000 });
	step("closing the reader lands on /book/:id; Back to shelf lands on /");

	await go(page, server.origin, `/book/${READABLE}`);
	await card(page).waitFor({ timeout: 60_000 });
	await page.getByRole("button", { name: "Read book" }).click(); // opens the book in 3D
	await page
		.getByRole("complementary", { name: "Book actions" })
		.getByRole("button", { name: "Book is open" })
		.waitFor({ timeout: 30_000 });
	await page.getByRole("button", { name: "Read book" }).click(); // then the reader
	await reader(page).waitFor({ timeout: 30_000 });
	await at(page, `/read/${READABLE}`);
	await page.goBack();
	await reader(page).waitFor({ state: "detached", timeout: 15_000 });
	await at(page, `/book/${READABLE}`);
	await card(page).waitFor();
	await page.goForward();
	await reader(page).waitFor({ timeout: 30_000 });
	await at(page, `/read/${READABLE}`);
	await page.goBack();
	await page.goBack();
	await at(page, "/");
	await reader(page).waitFor({ state: "detached", timeout: 15_000 });
	await card(page).waitFor({ state: "detached", timeout: 15_000 });
	step("card → Read pushes /read/:id; Back → card; Forward → reader; Back ×2 → Library");

	for (const bad of ["/book/no-such-book", "/read/no-such-book", "/book/shelf-loop-999:nope"]) {
		await go(page, server.origin, bad);
		await page.getByTestId("book-route-missing").waitFor({ timeout: 60_000 });
		assert.equal(await card(page).count(), 0, "no card for a missing book");
		assert.equal(await reader(page).count(), 0);
		await page.reload();
		await page.getByTestId("book-route-missing").waitFor({ timeout: 60_000 });
	}
	await page.getByRole("link", { name: "Go to your Library" }).click();
	await at(page, "/");
	await go(page, server.origin, `/read/${SENECA}`);
	await page.getByTestId("book-route-unreadable").waitFor({ timeout: 60_000 });
	await card(page).waitFor();
	assert.equal(await reader(page).count(), 0, "no blank reader for a book without a file");
	await go(page, server.origin, `/book/shelf-loop-2:${SENECA}`);
	await at(page, `/book/${SENECA}`);
	step("unknown ids → 'Book not found' (survives refresh) + Library link; no file → card + 'Nothing to read'; copies → canonical URL");

	await checkScanOfflineIsolationPeople({ ctx, page, server, step });
	assert.deepEqual(errors, [], "no page errors");
	await ctx.close();
	console.log(`\nbook-routes: ${passed} checks passed`);
} catch (error) {
	console.error("✖ book-routes failed:", error);
	process.exitCode = 1;
} finally {
	server.close();
}
