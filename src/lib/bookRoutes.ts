/**
 * Pure rules for the public book routes (`/book/:bookId`, `/read/:bookId`) over the shelves.
 * No React, router or store imports, so it runs under `node --test`.
 *
 * Ids resolve against what this device's shelves hold: the public BOOOKS catalog plus books
 * scanned on this device. Nothing here reads per-person (SQLite) data.
 */
export type BookTarget =
	| { kind: "library" }
	| { kind: "book"; id: string }
	| { kind: "read"; id: string };

export type RouteBook = {
	id: string;
	loopSourceId?: string;
	epub?: string;
	pdf?: string;
	scanPages?: unknown[];
};

export type BookResolution =
	| { status: "found"; id: string }
	/** A level-10 shelf copy ("shelf-loop-N:<id>"): use the canonical id instead. */
	| { status: "redirect"; id: string }
	| { status: "missing" }
	/** `/read/:id` for a book with no EPUB, PDF or scanned pages. */
	| { status: "unreadable"; id: string };

const LOOP = /^shelf-loop-\d+:(.+)$/;

/** The id a URL should use for a shelf book (repeated level-10 copies map to their original). */
export function canonicalBookId(id: string, books: readonly RouteBook[]) {
	return (
		books.find((b) => b.id === id)?.loopSourceId ?? LOOP.exec(id)?.[1] ?? id
	);
}

export const isReadable = (book: RouteBook) =>
	Boolean(book.epub || book.pdf || book.scanPages?.length);

/**
 * `onShelf` excludes books removed from this shelf (they stay in the store but are not placed),
 * so a link to a removed book is "missing" rather than a card floating over nothing.
 */
export function resolveBook(
	rawId: string,
	books: readonly RouteBook[],
	kind: "book" | "read",
	onShelf: (id: string) => boolean = () => true,
): BookResolution {
	const id = canonicalBookId(rawId, books);
	const book = books.find((b) => b.id === id && !b.loopSourceId);
	if (!book || !onShelf(id)) return { status: "missing" };
	if (id !== rawId) return { status: "redirect", id };
	if (kind === "read" && !isReadable(book)) return { status: "unreadable", id };
	return { status: "found", id };
}

export type TourView = {
	reader: "closed" | "zooming" | "open";
	bookPanel: "closed" | "preview" | "open";
	stage?: string;
};

/**
 * Moments that never map to a URL: the book is in flight (pull/return), or the store is between
 * the two writes of one action (`enter()` resets `bookPanel` before the action sets it again, so
 * "read" with a closed panel is seen for one update).
 */
export const isTransient = (view: TourView) =>
	view.stage === "pull" ||
	view.stage === "return" ||
	(view.stage === "read" &&
		view.bookPanel === "closed" &&
		view.reader === "closed");

/** What the shelves are showing right now, as a route target. */
export function targetFromView(
	view: TourView,
	selectedId: string,
	books: readonly RouteBook[],
): BookTarget {
	const id = canonicalBookId(selectedId, books);
	if (view.reader !== "closed") return { kind: "read", id };
	if (view.bookPanel !== "closed") return { kind: "book", id };
	return { kind: "library" };
}

export const sameTarget = (a: BookTarget, b: BookTarget) =>
	a.kind === b.kind &&
	(a.kind === "library" || a.id === (b as { id: string }).id);

export const targetDepth = (t: BookTarget) =>
	t.kind === "library" ? 0 : t.kind === "book" ? 1 : 2;

export const targetKey = (t: BookTarget) =>
	t.kind === "library" ? "library" : `${t.kind}:${t.id}`;

export type HistoryMove = "push" | "back" | "replace";

/**
 * How to reflect a shelves change in history: going deeper (Library → book → reader) pushes;
 * going back up pops when the entry just below is exactly where we are going (so Back/Forward
 * stay symmetrical), otherwise replaces; another book at the same depth replaces (no spam).
 * `keyBelow` is the `targetKey` of the history entry at index - 1, if this page saw it.
 */
export function historyMove(
	from: BookTarget,
	to: BookTarget,
	keyBelow: string | undefined,
): HistoryMove {
	const d = targetDepth(to) - targetDepth(from);
	if (d > 0) return "push";
	if (d < 0 && keyBelow === targetKey(to)) return "back";
	return "replace";
}
