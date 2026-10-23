import { type TornadoBook, tornadoLayout } from "./tornadoShape.ts";

/**
 * Pure mapping: a profile's library books → tornado instances. No React, three or storage.
 * Stable: slots follow `(addedAt, id)` and the spiral is sized for a fixed capacity, so the same
 * books land in the same place across renders and restarts, and adding a book never moves
 * existing ones.
 */
export const TORNADO_CAPACITY = 72;
const HEIGHT = 34;
const RADIUS = 9;
/** Cm → tornado units. A typical 13×20 cm paperback is ~1.6×2.4 units (the slice-1 placeholder size). */
const UNITS_PER_CM = 0.12;
const DEFAULT_CM: [number, number, number] = [13, 20, 2.5];

/** Subset of LibraryBookView the renderer needs (keeps this module storage-agnostic). */
export type TornadoSourceBook = {
	id: string;
	title: string;
	author: string;
	addedAt: number;
	source: "catalog" | "scan" | "manual";
	catalogId: string | null;
	widthCm: number | null;
	heightCm: number | null;
	thicknessCm: number | null;
	color: string | null;
	/** Resolved cover reference: a bundled asset path or a local FileStore blob key. */
	cover?:
		| { kind: "asset"; path: string }
		| { kind: "blob"; key: string; mimeType: string };
};

export type TornadoInstance = TornadoBook & {
	bookId: string;
	slot: number;
	/** Box size in tornado units [w, h, d]. */
	size: [number, number, number];
	/** Fallback cover color (deterministic) used when no cover texture is available. */
	color: string;
	cover: TornadoSourceBook["cover"];
	title: string;
	author: string;
};

/** Spiral slots for a full tornado; slot i is the same point for every library size. */
const SLOTS = tornadoLayout(TORNADO_CAPACITY, HEIGHT, RADIUS);

/** Same palette family as the legacy `book-box.web.jsx` (cover colors). */
const PALETTE = [
	"#8d1820",
	"#292b2d",
	"#24564c",
	"#244963",
	"#a95422",
	"#e1cfaa",
	"#52633d",
	"#963b34",
];

/** FNV-1a, like the legacy `hashText`, so a book's fallback color never changes. */
export function hashText(value: string): number {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

export function fallbackColor(
	book: Pick<TornadoSourceBook, "title" | "author" | "color">,
) {
	if (book.color && /^#[0-9a-f]{6}$/i.test(book.color)) return book.color;
	return PALETTE[hashText(`${book.title}|${book.author}`) % PALETTE.length];
}

export function sortForTornado<
	T extends Pick<TornadoSourceBook, "addedAt" | "id">,
>(books: T[]): T[] {
	return [...books].sort(
		(a, b) => a.addedAt - b.addedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
	);
}

const cmOr = (v: number | null, d: number) =>
	v && Number.isFinite(v) && v > 0 ? Math.min(v, 60) : d;

export function tornadoInstances(books: TornadoSourceBook[]): {
	instances: TornadoInstance[];
	hidden: number;
} {
	const sorted = sortForTornado(books);
	const visible = sorted.slice(0, TORNADO_CAPACITY);
	const instances = visible.map((book, slot) => {
		const s = SLOTS[slot];
		const size: [number, number, number] = [
			cmOr(book.widthCm, DEFAULT_CM[0]) * UNITS_PER_CM,
			cmOr(book.heightCm, DEFAULT_CM[1]) * UNITS_PER_CM,
			Math.max(0.12, cmOr(book.thicknessCm, DEFAULT_CM[2]) * UNITS_PER_CM),
		];
		return {
			...s,
			bookId: book.id,
			slot,
			size,
			color: fallbackColor(book),
			cover: book.cover,
			title: book.title,
			author: book.author,
		};
	});
	return { instances, hidden: sorted.length - visible.length };
}
