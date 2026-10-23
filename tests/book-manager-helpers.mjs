// Fixtures for tests/data-book-manager*.test.mjs.
import { PNG_A, PNG_B } from "./library-helpers.mjs";

const png = (dataUrl) => Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
export const A = png(PNG_A);
export const B = png(PNG_B);
/** Distinct bytes (a different hash), still a valid intake payload. */
export const C = new Uint8Array([...A, 0]);
export const page = (bytes, extra = {}) => ({ bytes, mimeType: "image/png", provenance: "device_file", ...extra });

/** A FileStore whose put() can be made to fail, wrapping a real in-memory store. */
export function flakyStore(inner) {
	const state = { failPut: false };
	return {
		state,
		store: {
			name: "flaky",
			put: async (k, b) => {
				if (state.failPut) throw new Error("Disk full");
				return inner.put(k, b);
			},
			get: (k) => inner.get(k),
			has: (k) => inner.has(k),
			delete: (k) => inner.delete(k),
		},
	};
}
