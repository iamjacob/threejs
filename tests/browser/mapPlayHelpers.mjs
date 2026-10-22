// Page helpers for tests/browser/map-play.mjs.
import { BASE } from "./harness.mjs";

export const probe = (page) => page.evaluate(() => window.__boooksMapProbe?.());
export const pxDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Opens /play and waits until the probe is live (and the remote style loaded, if online). */
export async function openPlay(page, origin, { online = true } = {}) {
	await page.goto(`${origin}${BASE}play`);
	await page
		.getByTestId("map-play-status")
		.filter({ hasNotText: "Loading" })
		.waitFor({ timeout: 60_000 });
	await page.waitForFunction(
		(needStyle) => {
			const p = window.__boooksMapProbe?.();
			return p && (!needStyle || p.styleLoaded);
		},
		online,
		{ timeout: 60_000 },
	);
}

const controller = (page) =>
	page.getByRole("button", { name: /Controller: drag to steer/ });

/** Thumb drag on the controller logo: press, move past DRAG_PX into the joystick, hold, release. */
export async function steer(page, dx, dy, ms) {
	const box = await controller(page).boundingBox();
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx + dx * 0.3, cy + dy * 0.3, { steps: 3 });
	await page.mouse.move(cx + dx, cy + dy, { steps: 5 });
	await page.waitForTimeout(ms);
	await page.mouse.up();
}

/** Opens the radial menu (quick tap) and clicks an action by its accessible label. */
export async function controllerAction(page, label) {
	await controller(page).click();
	// The radial wheel repeats items around the dial; pick a keyboard-reachable copy.
	await page
		.locator(`button.bc-item[aria-label="${label}"][tabindex="0"]`)
		.first()
		.click();
}

/** Simulates the app going to the background / returning (visibilitychange). */
export function setHidden(page, hidden) {
	return page.evaluate((h) => {
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			get: () => (h ? "hidden" : "visible"),
		});
		document.dispatchEvent(new Event("visibilitychange"));
	}, hidden);
}

/** Records any use of the Geolocation API on the page (must stay 0 on /play). */
export function trackGeolocation(page) {
	return page.addInitScript(() => {
		const g = navigator.geolocation;
		if (!g) return;
		const count = () => {
			window.__geoCalls = (window.__geoCalls ?? 0) + 1;
		};
		g.getCurrentPosition = count;
		g.watchPosition = () => {
			count();
			return 0;
		};
	});
}
