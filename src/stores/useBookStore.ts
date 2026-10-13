import { create } from "zustand";
import { useDissolveStore } from "../../stores/useDissolveStore";
import { useParticleStore } from "../../stores/useParticleStore";
import { useReadingStore } from "../../stores/useReadingStore";
import { books, type LibraryBook } from "../lib/bookCatalog";

type BookState = {
	books: LibraryBook[];
	addBook: (book: LibraryBook) => void;
	selectedBookId: string;
	selectBook: (id: string) => void;
};

export const useBookStore = create<BookState>()((set, get) => ({
	books,
	addBook: (book) => {
		if (get().books.some((entry) => entry.id === book.id)) return;
		set((state) => ({ books: [...state.books, book] }));
		get().selectBook(book.id);
	},
	selectedBookId: books[Math.floor(Math.random() * books.length)].id,
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
		useReadingStore.setState({
			selectedPage: 0,
			currentPage: 0,
			bookOpen: false,
		});
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
