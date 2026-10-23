// Page helpers for tests/browser/routes.mjs.
import { BASE } from "./harness.mjs";

export const controller = (page) => page.getByRole("button", { name: /Controller: drag to steer/ });
export const overlay = (page) => page.getByTestId("scene-transition");

/** A selector that proves each live route rendered its own content (not the not-found page). */
export const READY = {
	"/": (page) => controller(page),
	"/scan": (page) => page.locator("#book-scanner"),
	"/maps": (page) => page.getByTestId("map-play-status").filter({ hasNotText: "Loading" }),
	"/notes": (page) => page.getByTestId("title"),
	"/people": (page) => page.getByTestId("active-person"),
	"/profile": (page) => page.getByTestId("profile-name"),
	"/more": (page) => page.getByTestId("more-explore"),
	"/library": (page) => page.getByTestId("library-empty").or(page.getByTestId("library-list")),
};
const SLOW = { "/": 120_000, "/scan": 60_000, "/maps": 90_000 };

export const url = (origin, path) => `${origin}${BASE}${path.replace(/^\//, "")}`;
export const pathOf = (page) => new URL(page.url()).pathname.slice(BASE.length - 1) || "/";

export async function waitReady(page, path) {
	await READY[path](page).first().waitFor({ timeout: SLOW[path] ?? 30_000 });
	if ((await page.getByTestId("not-found").count()) > 0) throw new Error(`${path} rendered not-found`);
}

/**
 * Quick tap on the controller, then an action by its accessible label (keyboard-reachable copy).
 * The dial shows ~7 of its items at a time; arrow keys rotate it until the item is reachable.
 */
export async function controllerAction(page, label) {
	await controller(page).click();
	const item = page.locator(`button.bc-item[aria-label="${label}"][tabindex="0"]`).first();
	for (let i = 0; i < 16 && !(await item.count()); i++) {
		await page.keyboard.press("ArrowRight");
		await page.waitForTimeout(120);
	}
	await item.click();
}

export async function swReady(page) {
	return page.evaluate(async () => {
		if (!navigator.serviceWorker) return false;
		const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 15_000))]);
		if (!reg) return false;
		if (!navigator.serviceWorker.controller)
			await new Promise((r) => {
				navigator.serviceWorker.addEventListener("controllerchange", r, { once: true });
				setTimeout(r, 5_000);
			});
		return !!navigator.serviceWorker.controller;
	});
}

/**
 * Records every DOM state on /profile as "name|visibility", so a test can prove no frame ever
 * shows one person's name with another person's details (or the old person after a switch).
 */
export function recordProfileFrames(page) {
	return page.evaluate(() => {
		window.__frames = [];
		const snap = () => {
			const name = document.querySelector('[data-testid="profile-name"]')?.textContent ?? "(none)";
			const vis = document.querySelector('[data-testid="profile-visibility"]')?.textContent ?? "";
			const last = window.__frames.at(-1);
			const frame = `${name}|${vis}`;
			if (frame !== last) window.__frames.push(frame);
		};
		snap();
		window.__frameObserver?.disconnect();
		window.__frameObserver = new MutationObserver(snap);
		window.__frameObserver.observe(document.body, { subtree: true, childList: true, characterData: true });
	});
}
export const frames = (page) => page.evaluate(() => window.__frames ?? []);

/** Records the overlay's phase and computed animation per mutation (for reduced-motion checks). */
export function recordOverlay(page) {
	return page.evaluate(() => {
		window.__overlay = [];
		new MutationObserver(() => {
			const el = document.querySelector('[data-testid="scene-transition"]');
			if (!el) return;
			const entry = `${el.dataset.phase}:${getComputedStyle(el).animationName}`;
			if (window.__overlay.at(-1) !== entry) window.__overlay.push(entry);
		}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-phase"] });
	});
}
export const overlayLog = (page) => page.evaluate(() => window.__overlay ?? []);
