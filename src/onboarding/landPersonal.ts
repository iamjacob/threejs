import { useShelfControlsStore } from "../../stores/useShelfControlsStore";
import { addScannedBookToLibrary } from "../lib/hydrateInitialLibrary";
import { useBookStore } from "../stores/useBookStore";
import { getPersonalBook } from "./personalBook";

let landing: Promise<void> | null = null;

/**
 * Puts the onboarding cover on the real shelf, first in the row.
 * `addScannedBookToLibrary` is the same insert the full scanner uses.
 * Safe to call from both Save and arrival; the second call waits on the first.
 */
export function landPersonalBookOnShelf() {
	if (landing) return landing;
	const book = getPersonalBook();
	if (!book?.title.trim() || !book.coverDataUrl) return Promise.resolve();
	const snapshot = book;
	landing = place(snapshot).catch(() => undefined);
	return landing;
}

export function resetPersonalLanding() {
	landing = null;
}

async function place(book: NonNullable<ReturnType<typeof getPersonalBook>>) {
	const shelf = useShelfControlsStore.getState();
	if (!shelf.initialized) {
		shelf.initialize(useBookStore.getState().books);
	}
	const before = new Set(
		useBookStore.getState().books.map((entry) => entry.id),
	);
	await addScannedBookToLibrary({
		title: book.title,
		author: book.author,
		front: { image: book.coverDataUrl, width: 512, height: 768 },
	});
	const added = useBookStore
		.getState()
		.books.find((entry) => !before.has(entry.id));
	if (!added) return;
	useShelfControlsStore.setState((state) => {
		if (!state.document.items[added.id]) return {};
		const rest = state.document.order.filter((id) => id !== added.id);
		return {
			document: { ...state.document, order: [added.id, ...rest] },
			selectedIds: [added.id],
		};
	});
}
