// Page helpers for tests/browser/tornado-books.mjs.
import { probe } from "./mapPlayHelpers.mjs";

export const PNG =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export const waitLib = (page, re) =>
	page.getByTestId("map-play-library").filter({ hasText: re }).waitFor({ timeout: 30_000 });

/** Waits until the cover sheet for `profileId` (optional) with exactly `n` books is rendered. */
export const waitSheet = (page, n, profileId) =>
	page.waitForFunction(
		([n, pid]) => {
			const l = window.__boooksMapProbe?.()?.library;
			return l && l.ids.length === n && (!pid || l.profileId === pid);
		},
		[n, profileId],
		{ timeout: 30_000 },
	);

export const lib = async (page) => (await probe(page)).library;

/** Seeds the scanner's legacy IndexedDB exactly as scannedBook.ts writes it (v1, store `books`). */
export const seedLegacyScan = (page, record) =>
	page.evaluate(
		(rec) =>
			new Promise((resolve, reject) => {
				const r = indexedDB.open("boooks-scans", 1);
				r.onupgradeneeded = () => r.result.createObjectStore("books", { keyPath: "id" });
				r.onsuccess = () => {
					const tx = r.result.transaction("books", "readwrite");
					tx.objectStore("books").put(rec);
					tx.oncomplete = () => {
						r.result.close();
						resolve();
					};
					tx.onerror = () => reject(tx.error);
				};
				r.onerror = () => reject(r.error);
			}),
		record,
	);

export const countLegacy = (page) =>
	page.evaluate(
		() =>
			new Promise((resolve) => {
				const r = indexedDB.open("boooks-scans", 1);
				r.onsuccess = () => {
					const q = r.result.transaction("books").objectStore("books").count();
					q.onsuccess = () => {
						r.result.close();
						resolve(q.result);
					};
				};
			}),
	);

/** Deletes every blob from the web FileStore (simulates evicted / never-copied cover files). */
export const clearFileStore = (page) =>
	page.evaluate(
		() =>
			new Promise((resolve) => {
				const r = indexedDB.open("boooks-files", 1);
				r.onsuccess = () => {
					const tx = r.result.transaction("blobs", "readwrite");
					tx.objectStore("blobs").clear();
					tx.oncomplete = () => {
						r.result.close();
						resolve();
					};
				};
			}),
	);

/** Triggers the /maps library refresh (the app refreshes on window focus). */
export const refocus = (page) => page.evaluate(() => window.dispatchEvent(new Event("focus")));

/** Average frame time over `ms` of rAF on the page. */
export const frameTime = (page, ms = 3000) =>
	page.evaluate(
		(ms) =>
			new Promise((resolve) => {
				const times = [];
				let last = performance.now();
				const end = last + ms;
				const tick = (t) => {
					times.push(t - last);
					last = t;
					if (t < end) requestAnimationFrame(tick);
					else {
						times.sort((a, b) => a - b);
						resolve({ frames: times.length, median: times[times.length >> 1], p95: times[Math.floor(times.length * 0.95)] });
					}
				};
				requestAnimationFrame(tick);
			}),
		ms,
	);
