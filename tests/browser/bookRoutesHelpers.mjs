// Page helpers for tests/browser/book-routes.mjs.
import { BASE } from "./harness.mjs";

export const SENECA = "978-0-141-01881-2"; // catalog, no reading file
export const READABLE = "9788797248003"; // catalog, bundled PDF ("Mit liv med Fangekoret")
export const SCAN = "scan-route-1"; // legacy device scan with photographed pages (guest-owned)

export const go = (page, origin, path) => page.goto(`${origin}${BASE}${path.replace(/^\//, "")}`);
export const pathOf = (page) => decodeURIComponent(new URL(page.url()).pathname.slice(BASE.length - 1)) || "/";
export const controller = (page) => page.getByRole("button", { name: /Controller: drag to steer/ });
export const card = (page) => page.getByRole("region", { name: "Book information" });
export const reader = (page) => page.locator("dialog[open][aria-label^='Read ']");
export const cardTitle = (page) => card(page).locator("h2").first();

/** Waits until the shelves scene has booted (controller or a book view is up). */
export async function shelvesUp(page) {
	await page
		.locator(".bc-btn, section[aria-label='Book information'], dialog[open], [data-testid^='book-route-']")
		.first()
		.waitFor({ timeout: 120_000 });
}

/** The card title is inside a collapsed details panel; read it from the DOM text. */
export const titleText = (page) => cardTitle(page).evaluate((el) => el.textContent);

export async function waitPath(page, path, timeout = 15_000) {
	await page.waitForFunction(
		([base, p]) => decodeURIComponent(location.pathname.slice(base.length - 1)) === p,
		[BASE, path],
		{ timeout },
	);
}

/** Seeds a guest-owned legacy scan with one photographed page (the shape scannedBook.ts writes). */
export const seedScan = (page, png) =>
	page.evaluate(
		([id, img]) =>
			new Promise((resolve, reject) => {
				const r = indexedDB.open("boooks-scans", 1);
				r.onupgradeneeded = () => r.result.createObjectStore("books", { keyPath: "id" });
				r.onsuccess = () => {
					const tx = r.result.transaction("books", "readwrite");
					tx.objectStore("books").put({
						id,
						title: "My Route Scan",
						author: "Me",
						pages: 1,
						demoPages: 1,
						readDate: "2026-10-22",
						cover: { front: img, back: img, spine: img },
						textureUrls: [img, img, img, img, img, img],
						dimensions: [0.4, 0.6, 0.05],
						scale: { width: 0.4, height: 0.6, thickness: 0.05 },
						scanPages: [{ image: img, width: 1, height: 1 }],
					});
					tx.oncomplete = () => {
						r.result.close();
						resolve();
					};
					tx.onerror = () => reject(tx.error);
				};
				r.onerror = () => reject(r.error);
			}),
		[SCAN, png],
	);

/** Records every frame where the scan's title is visible, with the active person shown on /profile. */
export function watchScanTitle(page) {
	return page.evaluate(() => {
		window.__scanSeen = 0;
		new MutationObserver(() => {
			if (document.body.innerText.includes("My Route Scan")) window.__scanSeen++;
		}).observe(document.body, { subtree: true, childList: true, characterData: true });
	});
}
export const scanSeen = (page) => page.evaluate(() => window.__scanSeen ?? 0);
