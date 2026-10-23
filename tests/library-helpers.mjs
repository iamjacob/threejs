// Fixtures for library-book tests.
export const PNG_A =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
export const PNG_B =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
export const SENECA = {
	id: "978-0-141-01881-2",
	title: "Seneca",
	author: "Seneca",
	size: { width: 11, height: 18, thickness: 0.7 },
};

/** In-memory stand-in for the legacy IndexedDB store (records + "imported" markers). */
export function legacyStore(records) {
	const marks = new Map();
	return {
		records,
		marks,
		async list() {
			return structuredClone(records);
		},
		async importedIds() {
			return new Set(marks.keys());
		},
		async markImported(id, profileId) {
			marks.set(id, profileId);
		},
	};
}

/** A legacy scan record shaped like scannedBook.ts output (world-unit dimensions). */
export const scan = (id, extra = {}) => ({
	id,
	title: `Scan ${id}`,
	author: "Me",
	cover: { front: PNG_A, back: PNG_B, spine: "blob:not-embedded" },
	dimensions: [0.4, 0.6, 0.05],
	...extra,
});
