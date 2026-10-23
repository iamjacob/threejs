import assert from "node:assert/strict";
import { test } from "node:test";

const { canonicalBookId, historyMove, isReadable, isTransient, resolveBook, targetFromView, targetKey } =
	await import("../src/lib/bookRoutes.ts");

test("in-between scene states never become URLs (regression: opening a book in 3D jumped to /)", () => {
	const v = (stage, bookPanel, reader = "closed") => ({ stage, bookPanel, reader });
	// The real sequence observed in Chrome for card → "Read" (open in 3D).
	for (const s of [v("pull", "closed"), v("pull", "open"), v("read", "closed"), v("return", "closed")])
		assert.ok(isTransient(s), JSON.stringify(s));
	for (const s of [v("pick", "preview"), v("read", "open"), v("library", "closed"), v("read", "open", "open")])
		assert.ok(!isTransient(s), JSON.stringify(s));
});

const books = [
	{ id: "seneca", pdf: "/s.pdf" },
	{ id: "plain" },
	{ id: "scan-1", scanPages: [{}] },
	{ id: "shelf-loop-3:seneca", loopSourceId: "seneca", pdf: "/s.pdf" },
];

test("ids: known books resolve; unknown ids and removed books are 'missing'", () => {
	assert.deepEqual(resolveBook("seneca", books, "book"), { status: "found", id: "seneca" });
	assert.deepEqual(resolveBook("nope", books, "book"), { status: "missing" });
	assert.deepEqual(resolveBook("", books, "read"), { status: "missing" });
	const onShelf = (id) => id !== "plain";
	assert.deepEqual(resolveBook("plain", books, "book", onShelf), { status: "missing" }, "removed from the shelf");
});

test("level-10 shelf copies redirect to the canonical book (one URL per book)", () => {
	assert.equal(canonicalBookId("shelf-loop-3:seneca", books), "seneca");
	assert.equal(canonicalBookId("shelf-loop-99:seneca", books), "seneca", "copies not yet in the store");
	assert.deepEqual(resolveBook("shelf-loop-3:seneca", books, "read"), { status: "redirect", id: "seneca" });
	assert.deepEqual(resolveBook("shelf-loop-3:nope", books, "book"), { status: "missing" });
});

test("/read needs something to read; /book does not", () => {
	assert.ok(isReadable(books[0]) && isReadable(books[2]) && !isReadable(books[1]));
	assert.deepEqual(resolveBook("plain", books, "read"), { status: "unreadable", id: "plain" });
	assert.deepEqual(resolveBook("plain", books, "book"), { status: "found", id: "plain" });
	assert.deepEqual(resolveBook("scan-1", books, "read"), { status: "found", id: "scan-1" });
});

test("scene state → route target (reader beats card beats library; copies are canonical)", () => {
	const v = (reader, bookPanel) => ({ reader, bookPanel });
	assert.deepEqual(targetFromView(v("closed", "closed"), "seneca", books), { kind: "library" });
	assert.deepEqual(targetFromView(v("closed", "preview"), "seneca", books), { kind: "book", id: "seneca" });
	assert.deepEqual(targetFromView(v("closed", "open"), "shelf-loop-3:seneca", books), { kind: "book", id: "seneca" });
	assert.deepEqual(targetFromView(v("zooming", "open"), "seneca", books), { kind: "read", id: "seneca" });
	assert.deepEqual(targetFromView(v("open", "closed"), "seneca", books), { kind: "read", id: "seneca" });
});

test("history: deeper pushes; back up to the entry below pops; otherwise replace", () => {
	const lib = { kind: "library" };
	const card = (id) => ({ kind: "book", id });
	const read = (id) => ({ kind: "read", id });
	assert.equal(historyMove(lib, card("a"), undefined), "push");
	assert.equal(historyMove(card("a"), read("a"), "library"), "push");
	assert.equal(historyMove(read("a"), card("a"), targetKey(card("a"))), "back", "Close reader = Back");
	assert.equal(historyMove(card("a"), lib, "library"), "back", "Back to shelf = Back");
	assert.equal(historyMove(card("a"), lib, undefined), "replace", "direct entry: nothing below to pop");
	assert.equal(historyMove(read("a"), card("a"), undefined), "replace", "deep link into the reader, then close");
	assert.equal(historyMove(card("a"), card("b"), "library"), "replace", "browsing books does not spam history");
	assert.equal(historyMove(read("a"), lib, targetKey(card("a"))), "replace", "skip a level: no wrong pop");
});
