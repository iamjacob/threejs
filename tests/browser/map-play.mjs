// Real-browser check of /maps (Chrome + WebGL; not part of `node --test`).
// npm run build:test && npm run test:map-play
import assert from "node:assert/strict";
import { crash, freshProfile, launch, serveDist } from "./harness.mjs";
import { controllerAction, openPlay, probe, pxDist, setHidden, steer, trackGeolocation } from "./mapPlayHelpers.mjs";

const server = await serveDist(4319);
const profile = await freshProfile("/tmp/boooks-map-play-profile");
let passed = 0;
const step = (name) => {
	passed++;
	console.log(`✔ ${name}`);
};
const aligned = (p, msg) => assert.ok(pxDist(p.entityPx, p.playerPx) < 2, `${msg}: ${JSON.stringify({ e: p.entityPx, m: p.playerPx })}`);

try {
	let { ctx, page } = await launch(profile);
	await trackGeolocation(page);
	await openPlay(page, server.origin);
	let p = await probe(page);
	assert.ok(p.webgl, "WebGL canvas active");
	aligned(p, "initial");
	assert.match(await page.locator(".maplibregl-ctrl-attrib").innerText(), /OpenStreetMap/);
	step("map + 3D layer load; tornado drawn at its lng/lat; OSM attribution shown");

	const start = p.player;
	await steer(page, 0, -44, 1500);
	await page.waitForTimeout(400);
	p = await probe(page);
	assert.ok(p.player.lat > start.lat + 0.0002, `moved north (${start.lat} → ${p.player.lat})`);
	assert.ok(Math.abs(p.mapCenter.lat - p.player.lat) < 1e-5, "camera follows the player");
	aligned(p, "after moving");
	step("joystick drag → steer command → simulation → render; camera follows");

	for (const view of [{ bearing: 75, pitch: 60, zoom: 17 }, { bearing: -140, pitch: 20, zoom: 15 }, { bearing: 10, pitch: 74, zoom: 18.5 }]) {
		await page.evaluate((v) => window.__boooksMap.jumpTo(v), view);
		await page.waitForTimeout(250);
		aligned(await probe(page), `view ${JSON.stringify(view)}`);
	}
	await page.evaluate(() => {
		window.__boooksMap.fire("dragstart");
		window.__boooksMap.panBy([220, -140], { duration: 0 });
	});
	await page.waitForTimeout(250);
	p = await probe(page);
	assert.equal(p.following, false, "user pan detaches the camera");
	aligned(p, "after a free pan");
	assert.ok(pxDist(p.entityPx, p.screenCenter) > 100, "entity moved with the map, not the screen");
	step("entity stays on its geographic point across pan, zoom, pitch and rotation");

	await controllerAction(page, "Follow tornado");
	await page.evaluate(() => window.__boooksMap.jumpTo({ bearing: 90 }));
	await page.waitForTimeout(200);
	const beforeEast = (await probe(page)).player;
	await steer(page, 0, -44, 1000);
	await page.waitForTimeout(300);
	p = await probe(page);
	assert.ok(p.following, "follow re-attached");
	assert.ok(p.player.lng > beforeEast.lng + 0.0002 && Math.abs(p.player.lat - beforeEast.lat) < 0.0002, "moved east");
	step("stick 'up' moves screen-up on a rotated map (bearing → view command)");

	await controllerAction(page, "Pause");
	await page.getByTestId("map-play-status").filter({ hasText: "Paused" }).waitFor();
	await page.getByTestId("map-play-meta").filter({ hasText: "checkpoint saved" }).waitFor({ timeout: 10_000 });
	const pausedAt = (await probe(page)).player;
	await steer(page, 44, 0, 800);
	assert.deepEqual((await probe(page)).player, pausedAt, "no movement while paused");
	await controllerAction(page, "Resume");
	await page.getByTestId("map-play-status").filter({ hasNotText: "Paused" }).waitFor();
	step("controller pause stops play and saves a checkpoint; resume works");

	await page.evaluate(() => {
		history.pushState({}, "", location.pathname.replace(/maps$/, "notes"));
		dispatchEvent(new PopStateEvent("popstate"));
	});
	await page.getByTestId("title").waitFor({ timeout: 30_000 });
	await page.goBack();
	await page.waitForFunction(() => window.__boooksMapProbe?.()?.styleLoaded, null, { timeout: 60_000 });
	assert.equal((await probe(page)).drivers, 1, "one frame driver after remount");
	const r0 = (await probe(page)).player;
	await steer(page, 44, 0, 1200);
	p = await probe(page);
	assert.ok(p.maxObservedSpeed <= 35.01, `top speed not doubled (${p.maxObservedSpeed})`);
	assert.ok(p.player.lng !== r0.lng, "still controllable");
	step("route exit + remount: one driver, normal top speed, still controllable");

	await controllerAction(page, "Pause");
	await page.getByTestId("map-play-meta").filter({ hasText: "checkpoint saved" }).waitFor({ timeout: 10_000 });
	await page.waitForTimeout(300);
	const saved = (await probe(page)).player;
	await crash(ctx, profile);
	({ ctx, page } = await launch(profile));
	await trackGeolocation(page);
	await openPlay(page, server.origin);
	await page.getByTestId("map-play-meta").filter({ hasText: "checkpoint restored" }).waitFor({ timeout: 15_000 });
	p = await probe(page);
	assert.ok(Math.abs(p.player.lat - saved.lat) < 1e-7 && Math.abs(p.player.lng - saved.lng) < 1e-7, "restored");
	step("checkpoint from pause survives a browser SIGKILL and is restored on relaunch");

	await setHidden(page, true);
	assert.ok((await probe(page)).pauseReasons.includes("background"), "paused for background");
	await setHidden(page, false);
	assert.deepEqual((await probe(page)).pauseReasons, [], "resumed");
	step("visibility hidden → paused (background); visible → resumed");

	await ctx.setOffline(true);
	await page.reload();
	await openPlay(page, server.origin, { online: false });
	const off0 = (await probe(page)).player;
	await steer(page, 0, -44, 800);
	assert.ok((await probe(page)).player.lat > off0.lat, "moves offline");
	await ctx.setOffline(false);
	step("offline reload (network off): app shell from service worker; tornado still controllable");

	assert.equal(await page.evaluate(() => window.__geoCalls ?? 0), 0);
	step("geolocation API never called on /maps (no permission prompt)");
	await ctx.close();

	// First launch with the map servers unreachable (nothing cached): bundled style fallback.
	({ ctx, page } = await launch(await freshProfile("/tmp/boooks-map-play-nomap")));
	await ctx.route(/^https:\/\/tiles\.openfreemap\.org\//, (r) => r.abort("internetdisconnected"));
	await openPlay(page, server.origin, { online: false });
	await page.getByTestId("map-play-meta").filter({ hasText: "Offline map" }).waitFor({ timeout: 20_000 });
	const nm0 = (await probe(page)).player;
	await steer(page, 0, -44, 800);
	p = await probe(page);
	assert.ok(p.player.lat > nm0.lat, "moves on the bundled style");
	aligned(p, "on the bundled style");
	step("map servers unreachable on first launch: bundled style, still playable and aligned");
	await ctx.close();
	console.log(`\nmap-play: ${passed} checks passed`);
} catch (error) {
	console.error("✖ map-play failed:", error);
	process.exitCode = 1;
} finally {
	server.close();
}
