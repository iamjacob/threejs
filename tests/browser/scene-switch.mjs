// Real-browser check: shelves "/" ⇄ Maps "/maps" through the joystick menu, with the transition
// overlay and the back-and-forth loader. Needs Chrome + WebGL. Not part of `node --test`.
// Usage: npm run build:test && npm run test:scene-switch
import assert from "node:assert/strict";
import { BASE, freshProfile, launch, serveDist } from "./harness.mjs";
import { controllerAction, probe } from "./mapPlayHelpers.mjs";

const server = await serveDist(4320);
const dir = await freshProfile("/tmp/boooks-scene-switch-profile");
let passed = 0;
const step = (name) => {
	passed++;
	console.log(`✔ ${name}`);
};
const overlay = (page) => page.getByTestId("scene-transition");
const controller = (page) => page.getByRole("button", { name: /Controller: drag to steer/ });

/**
 * Shuttle x-offsets sampled for up to 1.6 s (one leg is 1.1 s), stopping early once both
 * directions were seen or the element is gone: it must move right AND left (ping-pong).
 */
async function shuttleMoves(page, selector) {
	return page.evaluate(async (sel) => {
		const el = document.querySelector(sel);
		if (!el) return { found: false };
		const xs = [];
		for (let i = 0; i < 32 && el.isConnected; i++) {
			xs.push(new DOMMatrix(getComputedStyle(el).transform).m41);
			await new Promise((r) => setTimeout(r, 50));
		}
		const deltas = xs.slice(1).map((x, i) => x - xs[i]);
		return { found: true, right: deltas.some((d) => d > 0.3), left: deltas.some((d) => d < -0.3), xs };
	}, selector);
}

async function shelvesReady(page) {
	await controller(page).waitFor({ timeout: 90_000 });
	await overlay(page).waitFor({ state: "detached", timeout: 30_000 });
}
async function mapReady(page) {
	await page.getByTestId("map-play").waitFor({ timeout: 60_000 });
	await page.getByTestId("map-play-status").filter({ hasNotText: "Loading" }).waitFor({ timeout: 60_000 });
	await overlay(page).waitFor({ state: "detached", timeout: 30_000 });
}

try {
	const { ctx, page } = await launch(dir);
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));

	await page.goto(`${server.origin}${BASE}`);
	const boot = await shuttleMoves(page, '[data-testid="mark-loader"] [data-testid="loader-shuttle"]');
	if (boot.found) {
		assert.ok(boot.right && boot.left, `boot loader bar goes back and forth: ${boot.xs}`);
		step("boot loader: the bar slides back and forth");
	} else console.log("! boot loader already gone before sampling (cached); ping-pong checked on the transition");
	await shelvesReady(page);

	for (let round = 1; round <= 3; round++) {
		await controllerAction(page, "Open map");
		await overlay(page).waitFor({ timeout: 2_000 });
		if (round === 1) {
			const moves = await shuttleMoves(page, '[data-testid="scene-transition"] [data-testid="loader-shuttle"]');
			assert.ok(moves.found && moves.right && moves.left, `transition bar goes back and forth: ${moves.xs}`);
		}
		await mapReady(page);
		assert.match(page.url(), /\/maps$/);
		const p = await probe(page);
		assert.ok(p.webgl, "map scene drawn after the transition");

		await controllerAction(page, "Shelves");
		await overlay(page).waitFor({ timeout: 2_000 });
		await shelvesReady(page);
		assert.ok(!page.url().endsWith("/maps"), "back on the shelves");
		step(`round ${round}: shelves → map → shelves via the joystick menu; overlay covers then clears`);
	}

	const scenery = await page.locator('button.bc-item[aria-label="Scenery"]').count();
	assert.ok(scenery > 0, "the scenery cycler is still in the shelves menu (renamed from 'Map')");
	// The map checkpoint is written on leaving /maps (runtime dispose) and lives in SQLite, so it
	// is checked through the next /maps mount instead of reading storage directly.
	await controllerAction(page, "Open map");
	await mapReady(page);
	assert.match(await page.getByTestId("map-play-meta").innerText(), /checkpoint (restored|saved)/, "leaving the map saved the checkpoint");
	step("leaving the map writes its checkpoint; the next visit restores it");

	assert.deepEqual(errors, [], "no page errors during transitions");
	await ctx.close();
	console.log(`\nscene-switch: ${passed} checks passed`);
} catch (error) {
	console.error("✖ scene-switch failed:", error);
	process.exitCode = 1;
} finally {
	server.close();
}
