import { useMemo } from "react";
import { useShelfControlsStore } from "../../../stores/useShelfControlsStore";
import type { ShelfDocument } from "../../lib/shelfModel";
import { useBookStore } from "../../stores/useBookStore";
import { useLevelStore } from "../../stores/useLevelStore";
import { progressionConfig } from "./progressionConfig";
import { shelfArcFraction } from "./shelfArrangement";
import type { ShelfBook } from "./shelfBooks";

/** Footprint the picture frame reserves on its shelf (frame width plus one gap). */
export const PICTURE_FRAME_WIDTH = 0.34 + 0.056 * 2;

/**
 * The library shelf's arc: at least the level's arc, wider when the books
 * (and the picture frame, when shown) need more room, a full circle at level 10.
 */
export function libraryArcFraction(
	books: ShelfBook[],
	document: ShelfDocument,
	initialized: boolean,
	frameVisible: boolean,
	libraryLevel: number,
) {
	const levelFraction = Math.max(
		...progressionConfig.levels[libraryLevel].shelves,
	);
	if (!initialized) return levelFraction;
	return shelfArcFraction(
		books,
		document,
		levelFraction,
		frameVisible ? PICTURE_FRAME_WIDTH + document.spacing : 0,
	);
}

/** Non-hook access for event handlers and camera framing. */
export function currentShelfArcFraction() {
	const shelf = useShelfControlsStore.getState();
	return libraryArcFraction(
		useBookStore.getState().books,
		shelf.document,
		shelf.initialized,
		shelf.pictureFrameVisible,
		useLevelStore.getState().libraryLevel,
	);
}

export function useShelfArcFraction() {
	const books = useBookStore((state) => state.books);
	const document = useShelfControlsStore((state) => state.document);
	const initialized = useShelfControlsStore((state) => state.initialized);
	const frame = useShelfControlsStore((state) => state.pictureFrameVisible);
	const libraryLevel = useLevelStore((state) => state.libraryLevel);
	return useMemo(
		() => libraryArcFraction(books, document, initialized, frame, libraryLevel),
		[books, document, initialized, frame, libraryLevel],
	);
}
