// Real-browser check of /people on the built PWA (needs Chrome; not part of `node --test`).
// Proves on web: 11 local people offline, consented "On this device" directory, same-device
// messages through SQLite → use case → Zustand → UI, no cross-person flash on switch, and
// persistence across a clean restart and a SIGKILL crash.
// Usage: npm run build && npm run test:shared-device   (CHROME_PATH overrides the browser)
import assert from "node:assert/strict";
import { BASE, crash, freshProfile, launch, serveDist } from "./harness.mjs";
import {
	active, addPerson, bodies, DRAFT, directoryNames, leaks, openPeople, SECRET, send, switchTo, turnOn, watchForLeaks,
} from "./sharedDeviceHelpers.mjs";

const server = await serveDist(4319);
const dir = await freshProfile("/tmp/boooks-shared-device-profile");
let passed = 0;
const step = (name) => {
	passed++;
	console.log(`✔ ${name}`);
};
const open = (page) => openPeople(page, server.origin, BASE);

try {
	let { ctx, page } = await launch(dir);
	await open(page);
	assert.equal(await active(page), "Guest");
	await ctx.setOffline(true); // everything below is local; no request may be needed
	for (let i = 1; i <= 11; i++) await addPerson(page, `Reader ${i}`);
	const options = await page.getByTestId("switch-person").locator("option").allInnerTexts();
	assert.equal(options.length, 12, "guest + 11 local people");
	assert.equal(await active(page), "Guest", "adding a person does not switch to them");
	assert.deepEqual(await directoryNames(page), [], "nobody is discoverable by default");
	step("offline: guest + 11 local people created, none discoverable by default");

	await switchTo(page, "Reader 1");
	await turnOn(page, "Ann");
	await switchTo(page, "Reader 2");
	await turnOn(page, "Ben");
	assert.deepEqual(await directoryNames(page), ["Ann"], "Reader 3..11 opted out → absent");
	const dirText = await page.getByTestId("directory").innerText();
	assert.ok(!dirText.includes("Reader"), "private profile names never appear in the directory");
	step("directory: opted-in people show only their chosen public name");

	await page.getByRole("button", { name: "Message Ann" }).click();
	await send(page, SECRET);
	assert.deepEqual(await bodies(page), [SECRET]);
	await page.getByTestId("compose").fill(DRAFT);
	step("Ben → Ann same-device message saved (shown only after the durable write)");

	await watchForLeaks(page, ["Reader 1", "Reader 2"]);
	for (const name of ["Reader 3", "Guest", "Reader 2", "Reader 4", "Reader 1", "Reader 11"]) {
		await switchTo(page, name);
		const member = name === "Reader 1" || name === "Reader 2";
		assert.equal(await page.getByTestId("conversation").count(), member ? 1 : 0, `${name} conversations`);
		assert.equal(await page.getByTestId("compose").count(), 0, "thread and draft closed on switch");
	}
	assert.deepEqual(await leaks(page), [], "no message/draft visible to a nonparticipant, even while loading");
	// Self-check: the watcher must report a leak when one exists (otherwise the check above proves nothing).
	await page.evaluate((s) => document.body.append(Object.assign(document.createElement("p"), { id: "canary", textContent: s })), SECRET);
	assert.ok((await leaks(page)).length > 0, "leak watcher detects a planted leak");
	await page.evaluate(() => { document.getElementById("canary")?.remove(); window.__leaks = []; });
	step("repeated switching: no conversation, message or draft leaks (MutationObserver)");

	await switchTo(page, "Reader 1");
	await page.getByTestId("conversation").click();
	await page.getByTestId("message").first().waitFor();
	assert.deepEqual(await bodies(page), [SECRET], "recipient sees it exactly once");
	await send(page, "reply right before a crash");
	await ctx.setOffline(false);
	const killed = await crash(ctx, dir);
	console.log(`  (SIGKILLed ${killed} Chrome processes)`);
	({ ctx, page } = await launch(dir));
	await open(page);
	assert.equal(await active(page), "Reader 1", "active person survives the crash");
	await page.getByTestId("conversation").click();
	await page.getByTestId("message").nth(1).waitFor();
	assert.deepEqual(await bodies(page), [SECRET, "reply right before a crash"]);
	step("SIGKILL right after send: both messages present exactly once after relaunch");

	await page.getByRole("button", { name: "Back" }).click();
	await page.getByTestId("hide").click();
	await page.getByTestId("show").waitFor();
	await switchTo(page, "Reader 5");
	assert.deepEqual(await directoryNames(page), ["Ben"], "Ann is gone from future lookups");
	await switchTo(page, "Reader 2");
	await page.getByTestId("conversation").click();
	assert.deepEqual(await bodies(page), [SECRET, "reply right before a crash"], "existing conversation kept");
	step("turning visibility off removes Ann from the directory; her conversation and data remain");

	await ctx.close();
	({ ctx, page } = await launch(dir));
	await open(page);
	assert.equal(await active(page), "Reader 2");
	assert.equal((await page.getByTestId("switch-person").locator("option").allInnerTexts()).length, 12);
	step("clean restart: all 12 profiles and the active person persist");

	const swActive = await page.evaluate(async () => {
		const reg = await Promise.race([navigator.serviceWorker?.ready, new Promise((r) => setTimeout(r, 10_000))]);
		return Boolean(reg?.active);
	});
	if (swActive) {
		await ctx.setOffline(true);
		await page.reload();
		await page.getByTestId("active-person").waitFor({ timeout: 30_000 });
		await switchTo(page, "Reader 1");
		await page.getByTestId("conversation").click();
		await send(page, "offline after reload");
		step("offline reload via the service worker; switching and messaging work with no network");
	} else console.log("! service worker not active; offline reload NOT checked");
	await ctx.close();
	console.log(`\nshared-device: ${passed} checks passed`);
} catch (error) {
	console.error("✖ shared-device failed:", error);
	process.exitCode = 1;
} finally {
	server.close();
}
