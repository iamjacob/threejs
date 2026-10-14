import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";

const root = fileURLToPath(new URL("../", import.meta.url));
const build = await rolldown({
	input: "test:book-browsing",
	platform: "node",
	plugins: [{
		name: "book-browsing-stores",
		resolveId(id) { if (id === "test:book-browsing") return id; },
		load(id) {
			if (id !== "test:book-browsing") return;
			return [
				["src/stores/useBookStore.ts", "useBookStore"],
				["src/stores/useTourStore.ts", "useTourStore"],
				["stores/useShelfControlsStore.ts", "useShelfControlsStore"],
				["stores/useReadingStore.ts", "useReadingStore"],
			].map(([path, name]) => `export { ${name} } from ${JSON.stringify(root + path)};`).join("\n");
		},
	}],
});
const { output } = await build.generate({ format: "esm" });
await build.close();
const { useBookStore: library, useTourStore: tour, useShelfControlsStore: shelf, useReadingStore: reading } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString("base64")}`);
const books = library.getState().books;
const book = books.find(entry => entry.epub || entry.pdf);
assert.ok(book, "catalog includes a readable book");
const other = books.find(entry => entry.id !== book.id);
shelf.getState().initialize(books);

beforeEach(() => {
	library.setState({ books, selectedBookId: books[0].id });
	shelf.getState().setEditing(false);
	tour.getState().start();
	tour.setState({ paused: true });
});

function openBook() {
	tour.getState().previewBook(book.id);
	tour.getState().openPreview();
	assert.equal(tour.getState().stage, "pull");
	tour.getState().advance();
}

test("tapping previews the chosen book without opening it or entering the editor", () => {
	const revision = tour.getState().focusRevision;
	tour.getState().previewBook(book.id);
	assert.equal(library.getState().selectedBookId, book.id);
	assert.equal(tour.getState().stage, "pick");
	assert.equal(tour.getState().bookPanel, "preview");
	assert.equal(tour.getState().paused, true);
	assert.equal(shelf.getState().editing, false);
	assert.equal(tour.getState().focusRevision, revision + 1);
	tour.getState().previewBook(other.id);
	assert.equal(library.getState().selectedBookId, other.id);
	assert.equal(tour.getState().focusRevision, revision + 2);
});

test("an invalid selection does not disturb the current book or flow", () => {
	tour.getState().previewBook(book.id);
	const state = tour.getState();
	tour.getState().previewBook("missing-book");
	assert.equal(tour.getState(), state);
	assert.equal(library.getState().selectedBookId, book.id);
});

test("Open finishes the 3D animation and stays on the book without advancing the demo", () => {
	openBook();
	assert.equal(tour.getState().stage, "read");
	assert.equal(tour.getState().bookPanel, "open");
	assert.equal(tour.getState().paused, true);
	reading.getState().goToPage(3);
	tour.getState().advance();
	assert.equal(tour.getState().stage, "read");
	assert.equal(reading.getState().selectedPage, 3);
});

test("Read can open directly from the card, and closing returns to the same preview", () => {
	tour.getState().previewBook(book.id);
	tour.getState().openReader();
	assert.equal(tour.getState().reader, "open");
	assert.equal(tour.getState().stage, "pick");
	tour.getState().previewBook(other.id);
	assert.equal(library.getState().selectedBookId, book.id);
	tour.getState().closeReader();
	assert.equal(tour.getState().reader, "closed");
	assert.equal(tour.getState().stage, "pick");
	assert.equal(tour.getState().bookPanel, "preview");
	assert.equal(tour.getState().paused, true);
});

test("closing the reader preserves an already open 3D book and its page", () => {
	openBook();
	reading.getState().goToPage(2);
	tour.getState().openReader();
	tour.getState().closeReader();
	assert.equal(tour.getState().stage, "read");
	assert.equal(tour.getState().bookPanel, "open");
	assert.equal(reading.getState().selectedPage, 2);
});

test("a cover-only scan can open in 3D but cannot launch an unrelated reading file", () => {
	const scan = { ...book, id: "scan-only", epub: undefined, pdf: undefined };
	library.getState().addBook(scan);
	tour.getState().previewBook(scan.id);
	tour.getState().openReader();
	assert.equal(tour.getState().reader, "closed");
	tour.getState().openPreview();
	tour.getState().advance();
	tour.getState().openReader();
	assert.equal(tour.getState().reader, "closed");
	assert.equal(tour.getState().stage, "read");
});

test("Back dismisses a preview and requests smooth shelf framing", () => {
	tour.getState().previewBook(book.id);
	const revision = tour.getState().focusRevision;
	tour.getState().dismissPreview();
	assert.equal(tour.getState().stage, "library");
	assert.equal(tour.getState().bookPanel, "closed");
	assert.equal(tour.getState().paused, true);
	assert.equal(tour.getState().focusRevision, revision + 1);
});

test("Back closes an open book, returns it to the shelf, and stops there", () => {
	openBook();
	tour.getState().dismissPreview();
	assert.equal(tour.getState().stage, "return");
	assert.equal(tour.getState().bookPanel, "closed");
	assert.equal(tour.getState().paused, false);
	tour.getState().advance();
	assert.equal(tour.getState().stage, "library");
	assert.equal(tour.getState().paused, true);
	assert.equal(shelf.getState().editing, false);
});

test("More opens the correct editor and Done can restore the book card", () => {
	tour.getState().previewBook(other.id);
	tour.getState().editPreview();
	assert.equal(shelf.getState().editing, true);
	assert.deepEqual(shelf.getState().selectedIds, [other.id]);
	shelf.getState().setEditing(false);
	assert.equal(tour.getState().bookPanel, "preview");
});

test("editing an open book first returns it to its shelf slot", () => {
	openBook();
	tour.getState().editPreview();
	assert.equal(shelf.getState().editing, false);
	assert.equal(tour.getState().stage, "return");
	tour.getState().advance();
	assert.equal(tour.getState().stage, "pick");
	assert.equal(tour.getState().bookPanel, "preview");
	assert.equal(shelf.getState().editing, true);
	assert.deepEqual(shelf.getState().selectedIds, [book.id]);
});

test("rapid clicks cannot switch books or open the reader during a flight", () => {
	tour.getState().previewBook(book.id);
	tour.getState().openPreview();
	tour.getState().previewBook(other.id);
	tour.getState().openPreview();
	tour.getState().editPreview();
	tour.getState().openReader();
	assert.equal(library.getState().selectedBookId, book.id);
	assert.equal(tour.getState().stage, "pull");
	assert.equal(tour.getState().reader, "closed");
	assert.equal(shelf.getState().editing, false);
});

test("Back can cancel opening, even while the 3D assets are still loading", () => {
	tour.getState().previewBook(book.id);
	tour.getState().openPreview();
	assert.equal(tour.getState().ready, false);
	tour.getState().dismissPreview();
	assert.equal(tour.getState().stage, "library");
	assert.equal(tour.getState().bookPanel, "closed");
	assert.equal(tour.getState().paused, true);
});

test("the optional demo retains its own reader and stage progression", () => {
	tour.getState().openBook(book.id);
	tour.getState().advance();
	assert.equal(tour.getState().stage, "read");
	assert.equal(tour.getState().bookPanel, "closed");
	tour.getState().openReader();
	assert.equal(tour.getState().reader, "zooming");
	tour.setState({ reader: "open" });
	tour.getState().closeReader();
	assert.equal(tour.getState().stage, "grow");
});

test("helix navigation focuses shelf books and safely switches away from an open book", () => {
	tour.getState().navigateBook(book.id);
	assert.equal(tour.getState().bookPanel, "preview");
	tour.getState().openPreview(); tour.getState().advance();
	tour.getState().navigateBook(other.id);
	assert.equal(tour.getState().stage, "return");
	assert.equal(library.getState().selectedBookId, book.id, "keep the returning model until its flight ends");
	assert.equal(tour.getState().pendingBookId, other.id);
	tour.getState().advance();
	assert.equal(library.getState().selectedBookId, other.id);
	assert.equal(tour.getState().bookPanel, "preview");
	assert.equal(tour.getState().pendingBookId, null);
});

test("rapid helix selection keeps the most recent destination while a book returns", () => {
	openBook();
	tour.getState().navigateBook(other.id);
	tour.getState().navigateBook(book.id);
	tour.getState().advance();
	assert.equal(library.getState().selectedBookId, book.id);
	assert.equal(tour.getState().bookPanel, "preview");
});

test("helix navigation can cancel an opening flight but cannot change books inside the reader or editor", () => {
	tour.getState().previewBook(book.id); tour.getState().openPreview();
	tour.getState().navigateBook(other.id);
	assert.equal(tour.getState().stage, "pick");
	assert.equal(library.getState().selectedBookId, other.id);
	tour.getState().previewBook(book.id); tour.getState().openReader();
	tour.getState().navigateBook(other.id);
	assert.equal(library.getState().selectedBookId, book.id);
	tour.getState().closeReader(); tour.getState().editPreview();
	tour.getState().navigateBook(other.id);
	assert.equal(library.getState().selectedBookId, book.id);
});
