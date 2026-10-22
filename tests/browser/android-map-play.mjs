// /play inside the Capacitor Android WebView (emulator or device). Uses the same probe as map-play.mjs.
// Prereqs: VITE_BOOOKS_TEST_HOOKS=1 native build installed (npm run test:android:play), adb device online.
import assert from "node:assert/strict";
import { _android as android } from "playwright-core";

const APP = "me.jacobg.boooks";
const [device] = await android.devices();
assert.ok(device, "an adb device/emulator is connected");
const shell = async (c) => (await device.shell(c)).toString().trim();
const probe = (page) => page.evaluate(() => window.__boooksMapProbe?.());
let passed = 0;
const step = (n) => {
	passed++;
	console.log(`✔ ${n}`);
};

async function launch() {
	await shell(`am start -n ${APP}/.MainActivity`);
	const page = await (await device.webView({ pkg: APP }, { timeout: 60_000 })).page();
	await page.evaluate(() => {
		history.pushState({}, "", "/play");
		dispatchEvent(new PopStateEvent("popstate"));
	});
	await page.waitForFunction(() => window.__boooksMapProbe?.(), null, { timeout: 90_000 });
	await page.getByTestId("map-play-status").filter({ hasNotText: "Loading" }).waitFor({ timeout: 60_000 });
	return page;
}
async function kill() {
	await shell(`am force-stop ${APP}`);
	for (let i = 0; i < 20 && (await shell(`pidof ${APP}`)); i++) await new Promise((r) => setTimeout(r, 250));
}
/**
 * Real OS touch (adb input) on the controller logo, so the WebView sees a genuine touch stream
 * (synthetic PointerEvents fail setPointerCapture). CSS px → device px via devicePixelRatio and
 * the WebView's offset on screen. `input swipe` with a duration holds the finger at the end.
 */
async function steer(page, dx, dy, ms) {
	const g = await page.evaluate(() => {
		const r = document
			.querySelector('[aria-label^="Controller: drag to steer"]')
			.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2, dpr: devicePixelRatio, ih: innerHeight };
	});
	// The WebView is bottom-aligned above any nav bar inset; derive its top from screen height.
	const screenH = Number((await shell("wm size")).match(/(\d+)x(\d+)/)[2]);
	const navInset = Number((await shell("dumpsys window | grep -m1 -oE 'navigationBars frame=\\[0,[0-9]+\\]\\[[0-9]+,[0-9]+\\]'")).match(/\[0,(\d+)\]/)?.[1] ?? screenH);
	const top = Math.max(0, navInset - g.ih * g.dpr);
	const sx = Math.round(g.x * g.dpr);
	const sy = Math.round(top + g.y * g.dpr);
	await shell(`input touchscreen swipe ${sx} ${sy} ${Math.round(sx + dx * g.dpr)} ${Math.round(sy + dy * g.dpr)} ${ms}`);
}
const aligned = (p, msg) =>
	assert.ok(Math.hypot(p.entityPx.x - p.playerPx.x, p.entityPx.y - p.playerPx.y) < 2, `${msg}: ${JSON.stringify([p.entityPx, p.playerPx])}`);

try {
	await shell(`pm clear ${APP}`);
	let page = await launch();
	let p = await probe(page);
	assert.ok(p.webgl, "WebGL in the Android WebView");
	aligned(p, "initial");
	const meta = await page.getByTestId("map-play-meta").innerText();
	step(`android: /play loads in the Capacitor WebView with WebGL (${meta})`);

	const start = p.player;
	// adb `input swipe` interpolates the finger linearly over the whole duration, so the stick is
	// only at full deflection at the very end: expect a few meters north, not the full speed run.
	await steer(page, 0, -60, 2500);
	await page.waitForTimeout(400);
	p = await probe(page);
	assert.ok(p.player.lat > start.lat + 0.00003, `moved north ≥ ~3 m (${start.lat} → ${p.player.lat})`);
	assert.ok(Math.abs(p.player.lng - start.lng) < Math.abs(p.player.lat - start.lat) * 2, "mostly north (bearing -16)");
	aligned(p, "after moving");
	for (const v of [{ bearing: 80, pitch: 55, zoom: 17 }, { bearing: -120, pitch: 15, zoom: 15.5 }]) {
		await page.evaluate((view) => window.__boooksMap.jumpTo(view), v);
		await page.waitForTimeout(300);
		aligned(await probe(page), `view ${JSON.stringify(v)}`);
	}
	step("android: joystick → simulation → render; entity aligned across zoom/pitch/rotation");

	await page.evaluate(() => {
		Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
		document.dispatchEvent(new Event("visibilitychange"));
	});
	await page.getByTestId("map-play-meta").filter({ hasText: "checkpoint saved" }).waitFor({ timeout: 15_000 });
	const saved = (await probe(page)).player;
	await kill();
	page = await launch();
	await page.getByTestId("map-play-meta").filter({ hasText: "checkpoint restored" }).waitFor({ timeout: 30_000 });
	p = await probe(page);
	assert.ok(Math.abs(p.player.lat - saved.lat) < 1e-7 && Math.abs(p.player.lng - saved.lng) < 1e-7, "restored");
	step("android: checkpoint written on background survives force-stop and is restored (native SQLite)");

	assert.equal(await shell(`dumpsys package ${APP} | grep -c 'ACCESS_FINE_LOCATION: granted=true' || true`), "0", "location never granted");
	step("android: location permission not granted/requested by /play");
	console.log(`\nandroid-map-play: ${passed} checks passed`);
} catch (error) {
	console.error("✖ android-map-play failed:", error);
	process.exitCode = 1;
} finally {
	await device.close();
}
