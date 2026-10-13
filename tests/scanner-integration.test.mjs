import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";

// Bundle the actual Vite stores so these tests exercise their shared Zustand instances.
const root = fileURLToPath(new URL("../", import.meta.url));
const build = await rolldown({
	input: "test:scan-stores",
	platform: "node",
	plugins: [{
		name: "scan-store-entry",
		resolveId(id) { if (id === "test:scan-stores") return id; },
		load(id) {
			if (id !== "test:scan-stores") return;
			return [
				["src/stores/useBookStore.ts", "useBookStore"],
				["src/stores/useTourStore.ts", "useTourStore"],
				["stores/useShelfControlsStore.ts", "useShelfControlsStore"],
				["stores/useParticleStore.ts", "useParticleStore"],
				["src/components/shelves/shelfArrangement.ts", "arrangeShelfBooks"],
			].map(([path, name]) => `export { ${name} } from ${JSON.stringify(root + path)};`).join("\n");
		},
	}],
});
const { output } = await build.generate({ format: "esm" });
await build.close();
const { useBookStore: library, useTourStore: tour, useShelfControlsStore: shelf, useParticleStore: particles, arrangeShelfBooks } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString("base64")}`);

test("a scanned cover enters the real library, forms as that same book, and lands in its shelf slot", () => {
	shelf.getState().initialize(library.getState().books);
	const book = {
		...library.getState().books[0], id: "scan-test-cover", title: "My scanned book",
		cover: { front: "data:image/webp;base64,front", spine: "data:image/webp;base64,spine", back: "data:image/webp;base64,back" },
		textureUrls: ["edge", "spine", "top", "bottom", "data:image/webp;base64,front", "back"],
		dimensions: [.5, .72, .055], scale: { width: .5, height: .72, thickness: .055 },
	};
	const originalCount = library.getState().books.length;
	library.getState().addBook(book);
	shelf.getState().insertBook(book.id);
	tour.getState().addScannedBook(book.id);
	assert.equal(library.getState().selectedBookId, book.id);
	assert.equal(library.getState().books.length, originalCount + 1);
	assert.equal(particles.getState().formingBookData, book);
	assert.equal(particles.getState().phase, "forming");
	assert.equal(tour.getState().stage, "add");
	assert.equal(tour.getState().userAddition, true);
	const placement = arrangeShelfBooks(library.getState().books, shelf.getState().document).find(entry => entry.book.id === book.id);
	assert.ok(placement);
	assert.equal(placement.book.cover.front, book.cover.front);
	assert.ok(placement.position.every(Number.isFinite));
	// A duplicate callback cannot create duplicate books or shelf entries.
	library.getState().addBook(book); shelf.getState().insertBook(book.id);
	assert.equal(library.getState().books.length, originalCount + 1);
	assert.equal(shelf.getState().document.order.filter(id => id === book.id).length, 1);
	particles.getState().completeFormation(); tour.getState().finishAdd();
	assert.equal(tour.getState().stage, "library");
	assert.equal(tour.getState().paused, true);
	assert.equal(tour.getState().userAddition, false);
	assert.equal(library.getState().selectedBookId, book.id);
	shelf.getState().openBookEditor(book.id);
	assert.equal(shelf.getState().editing, true);
	assert.deepEqual(shelf.getState().selectedIds, [book.id]);
	shelf.getState().undo();
	assert.equal(shelf.getState().document.items[book.id], undefined);
	shelf.getState().redo();
	assert.ok(shelf.getState().document.items[book.id]);
});
