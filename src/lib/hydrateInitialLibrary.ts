import { useShelfControlsStore } from "../../stores/useShelfControlsStore";
import {
	type BookScan,
	loadScannedBooks,
	saveScannedBook,
	scannedBook,
} from "../components/scanner/scannedBook";
import { useBookStore } from "../stores/useBookStore";
import { useTourStore } from "../stores/useTourStore";
import { REMOVED_BOOKS_KEY, readBookIds } from "./bookPreferences";
import { coverFacesOutsideAtlas } from "./coverAtlas";
import {
	ensureRuntimeAtlas,
	registerInitialAtlasHydration,
} from "./runtimeAtlas";

export function hydrateInitialLibrary() {
	return registerInitialAtlasHydration(async () => {
		const shelf = useShelfControlsStore.getState();
		if (!shelf.initialized) {
			shelf.initialize(useBookStore.getState().books);
		}
		const saved = await loadScannedBooks();
		if (!saved.length) return;
		await ensureRuntimeAtlas(
			saved.flatMap((entry) => coverFacesOutsideAtlas(entry.cover)),
		);
		useBookStore.setState((state) => ({
			books: [
				...state.books,
				...saved.filter(
					(entry) => !state.books.some((book) => book.id === entry.id),
				),
			],
		}));
		const selection = useShelfControlsStore.getState().selectedIds;
		const removed = readBookIds(REMOVED_BOOKS_KEY);
		for (const entry of saved) {
			if (!removed.includes(entry.id)) shelf.insertBook(entry.id);
		}
		useShelfControlsStore.setState({
			selectedIds: selection,
			past: [],
			future: [],
		});
	});
}

export async function addScannedBookToLibrary(scan: BookScan) {
	const newBook = await scannedBook(scan);
	let saved = true;
	await Promise.all([
		saveScannedBook(newBook).catch(() => {
			saved = false;
		}),
		ensureRuntimeAtlas(coverFacesOutsideAtlas(newBook.cover)),
	]);
	useBookStore.getState().addBook(newBook);
	useShelfControlsStore.getState().insertBook(newBook.id);
	useShelfControlsStore.getState().setEditing(false);
	useTourStore.getState().addScannedBook(newBook.id);
	return saved;
}
