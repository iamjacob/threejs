import { create } from "zustand";
import { useDissolveStore } from "../../stores/useDissolveStore";
import { useParticleStore } from "../../stores/useParticleStore";
import { useReadingStore } from "../../stores/useReadingStore";
import { books } from "../lib/bookCatalog";

type BookState = {
	selectedBookId: string;
	selectBook: (id: string) => void;
};

export const useBookStore = create<BookState>()((set, get) => ({
	selectedBookId: books[Math.floor(Math.random() * books.length)].id,
	selectBook: (id) => {
		if (get().selectedBookId === id || !books.some((book) => book.id === id))
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
			books.find((book) => book.id === state.selectedBookId) ?? books[0],
	);
