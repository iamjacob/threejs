import { create } from "zustand";
import { useDissolveStore } from "../../stores/useDissolveStore";
import { useParticleStore } from "../../stores/useParticleStore";
import { useReadingStore } from "../../stores/useReadingStore";
import { books, type LibraryBook } from "../lib/bookCatalog";

type BookState = {
	books: LibraryBook[];
	addBook: (book: LibraryBook) => void;
	resizeBook: (
		id: string,
		dimensions: [number, number, number],
	) => LibraryBook | undefined;
	selectedBookId: string;
	selectBook: (id: string) => void;
};

export const useBookStore = create<BookState>()((set, get) => ({
	books,
	addBook: (book) => {
		if (get().books.some((entry) => entry.id === book.id)) {
			set((state) => ({
				books: state.books.map((entry) =>
					entry.id === book.id ? book : entry,
				),
			}));
			get().selectBook(book.id);
			return;
		}
		set((state) => ({ books: [...state.books, book] }));
		get().selectBook(book.id);
	},
	resizeBook: (id, dimensions) => {
		const [width, height, thickness] = dimensions;
		const current = get().books.find((entry) => entry.id === id);
		if (!current) return undefined;
		const [w, h, t] = current.dimensions;
		if (
			Math.abs(w - width) < 1e-6 &&
			Math.abs(h - height) < 1e-6 &&
			Math.abs(t - thickness) < 1e-6
		)
			return current;
		const resize = (entry: LibraryBook): LibraryBook => ({
			...entry,
			dimensions,
			scale: { width, height, thickness },
		});
		const next = resize(current);
		set((state) => ({
			books: state.books.map((entry) =>
				entry.id === id
					? next
					: entry.loopSourceId === id
						? resize(entry)
						: entry,
			),
		}));
		return next;
	},
	selectedBookId: books[0].id,
	selectBook: (id) => {
		if (
			get().selectedBookId === id ||
			!get().books.some((book) => book.id === id)
		)
			return;
		useParticleStore.setState({
			formingBookData: null,
			phase: "idle",
			particleProgress: 0,
			bookScale: 1,
		});
		useDissolveStore.setState({
			dissolveProgress: 0,
			targetProgress: 0,
			isDissolving: false,
		});
		useReadingStore.getState().activateBook(id);
		set({ selectedBookId: id });
	},
}));

export const useSelectedBook = () =>
	useBookStore(
		(state) =>
			state.books.find((book) => book.id === state.selectedBookId) ??
			state.books[0],
	);

export const useLibraryBooks = () => useBookStore((state) => state.books);

useReadingStore.getState().activateBook(books[0].id);
