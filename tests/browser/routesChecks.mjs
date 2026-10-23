// Second half of tests/browser/routes.mjs: profile isolation, offline, mobile a11y, failure, motion.
import assert from "node:assert/strict";
import { BASE, freshProfile, launch } from "./harness.mjs";
import {
	controller, controllerAction, frames, overlay, overlayLog, recordOverlay, recordProfileFrames, swReady, url, waitReady,
} from "./routesHelpers.mjs";
import { addPerson, openPeople, switchTo, turnOn } from "./sharedDeviceHelpers.mjs";

export async function checkProfileOfflineMobile({ ctx, page, server, step }) {
	await openPeople(page, server.origin, BASE);
	await addPerson(page, "Reader 1");
	await addPerson(page, "Reader 2");
	await switchTo(page, "Reader 1");
	await turnOn(page, "Ann");
	await page.goto(url(server.origin, "/profile"));
	await page.getByTestId("profile-name").filter({ hasText: "Reader 1" }).waitFor();
	await recordProfileFrames(page);
	await page.getByTestId("profile-switch").selectOption({ label: "Reader 2" });
	await page.getByTestId("profile-name").filter({ hasText: "Reader 2" }).waitFor();
	await page.getByTestId("profile-visibility").filter({ hasText: "Not visible" }).waitFor();
	const seen = (await frames(page)).slice(1);
	assert.ok(seen.length > 0, "the switch was observed");
	for (const f of seen)
		assert.ok(f.startsWith("(none)|") || f === `Reader 2|Not visible to others on this device.`, `stale frame: ${f}`);
	await page.getByRole("navigation", { name: "Profile pages" }).getByRole("link", { name: /^People & messages/ }).click();
	await page.getByTestId("active-person").filter({ hasText: "Reader 2" }).waitFor();
	step(`profile switch on /profile: neutral loading only, never the previous person (${seen.join(" → ")})`);

	if (await swReady(page)) {
		await ctx.setOffline(true);
		for (const path of ["/profile", "/more", "/notes", "/people", "/nope"]) {
			await page.goto(url(server.origin, path));
			if (path === "/nope") await page.getByTestId("not-found").waitFor({ timeout: 30_000 });
			else await waitReady(page, path);
		}
		await ctx.setOffline(false);
		step("offline: /profile, /more, /notes, /people and not-found load from the service worker");
	} else console.log("! service worker not active; offline reload NOT checked");

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(url(server.origin, "/more"));
	await waitReady(page, "/more");
	const bar = page.getByRole("navigation", { name: "Primary" }).last();
	assert.deepEqual((await bar.getByRole("link").allInnerTexts()).map((n) => n.trim()), ["Library", "Scan", "Maps", "Profile"]);
	for (const box of await bar.getByRole("link").evaluateAll((as) => as.map((a) => a.getBoundingClientRect().toJSON())))
		assert.ok(box.width >= 44 && box.height >= 44, `touch target ${JSON.stringify(box)}`);
	assert.equal(await page.getByTestId("giga-footer").isVisible(), false, "no huge footer on mobile");
	await bar.getByRole("link", { name: "Profile" }).focus();
	await page.keyboard.press("Enter");
	await waitReady(page, "/profile");
	assert.equal(await bar.getByRole("link", { name: "Profile" }).getAttribute("aria-current"), "page");
	assert.equal(await page.evaluate(() => document.activeElement?.tagName), "H1", "focus moves to the page heading");
	step("mobile: 4 primary links ≥44px, footer hidden, keyboard Enter navigates, aria-current + heading focus");
}

export async function checkFailureAndMotion({ server, step }) {
	let { ctx, page } = await launch(await freshProfile("/tmp/boooks-routes-fail"));
	await page.goto(url(server.origin, "/"));
	await controller(page).waitFor({ timeout: 120_000 });
	const mapChunk = /\/assets\/MapPlay-[^/]+\.js$/;
	await ctx.route(mapChunk, (r) => r.abort("internetdisconnected"));
	await controllerAction(page, "Open map");
	await page.getByTestId("route-error").waitFor({ timeout: 30_000 });
	await overlay(page).waitFor({ state: "detached", timeout: 3_000 });
	await ctx.unroute(mapChunk);
	await page.getByRole("button", { name: "Try again" }).click();
	await waitReady(page, "/maps");
	step("Maps code unavailable: overlay drops to an accessible error; Try again recovers");
	await ctx.close();

	({ ctx, page } = await launch(await freshProfile("/tmp/boooks-routes-rm"), { reducedMotion: "reduce" }));
	await page.goto(url(server.origin, "/"));
	await controller(page).waitFor({ timeout: 120_000 });
	await recordOverlay(page);
	await controllerAction(page, "Open map");
	await waitReady(page, "/maps");
	await overlay(page).waitFor({ state: "detached", timeout: 30_000 });
	const log = await overlayLog(page);
	assert.ok(!log.some((e) => e.includes("scene-iris-in") || e.includes("scene-reveal")), `no spatial motion: ${log}`);
	assert.ok(log.includes("reveal:scene-fade-out"), `fade-only reveal: ${log}`);
	step(`reduced motion: no iris or scale, opacity-only reveal (${log.join(", ")})`);
	await ctx.close();
}
