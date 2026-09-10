import { create } from "zustand";
import { useDissolveStore } from "../../stores/useDissolveStore";
import { useParticleStore } from "../../stores/useParticleStore";
import { useReadingStore } from "../../stores/useReadingStore";
import {
	type BookPose,
	nextTourStage,
	type TourStage,
} from "../components/tour/tourStages";
import { books } from "../lib/bookCatalog";
import { useBookStore } from "./useBookStore";
import { useLevelStore } from "./useLevelStore";
import { usePresentationStore } from "./usePresentationStore";

type TourState = {
	stage: TourStage;
	elapsed: number;
	paused: boolean;
	ready: boolean;
	reader: "closed" | "zooming" | "open";
	openReader: () => void;
	closeReader: () => void;
	runId: number;
	action: "idle" | "running" | "done";
	origin: BookPose | null;
	returningBookId: string | null;
	usedHints: string[];
	dismissHint: (hint: string) => void;
	deletingBooks: Record<string, number>;
	deletedBookIds: string[];
	deleteBook: (id: string) => void;
	finishDelete: (id: string) => void;
	resetDeletedBooks: () => void;
	finishAdd: () => void;
	blurredBookIds: string[];
	toggleBookBlur: (id: string) => void;
	toggleAllBlur: () => void;
	start: () => void;
	enter: (stage: TourStage) => void;
	openBook: (id: string, origin?: BookPose) => void;
	closeBook: () => void;
	advance: () => void;
	runAction: () => void;
	togglePause: () => void;
};

function resetEffects() {
	useParticleStore.setState({
		phase: "idle",
		formingBookData: null,
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
}

export const useTourStore = create<TourState>((set, get) => ({
	stage: "library",
	elapsed: 0,
	paused: false,
	ready: false,
	reader: "closed",
	openReader: () => {
		if (get().stage === "read" && get().reader === "closed")
			set({ reader: "zooming", paused: true });
	},
	closeReader: () => {
		const { reader, stage } = get();
		if (reader === "closed") return;
		if (reader === "open" && stage === "read") {
			get().enter("grow");
			return;
		}
		set({ reader: "closed", paused: true });
	},
	runId: 0,
	action: "idle",
	origin: null,
	returningBookId: null,
	usedHints: [],
	dismissHint: (hint) =>
		set((state) => ({ usedHints: [...new Set([...state.usedHints, hint])] })),
	deletingBooks: {},
	deletedBookIds: [],
	deleteBook: (id) => {
		const state = get();
		if (
			state.stage !== "delete" ||
			!books.some((book) => book.id === id) ||
			state.deletedBookIds.includes(id) ||
			state.deletingBooks[id] !== undefined
		)
			return;
		set({
			deletingBooks: { ...state.deletingBooks, [id]: state.elapsed },
			action: "running",
			paused: false,
		});
		get().dismissHint("delete");
	},
	finishDelete: (id) => {
		const state = get();
		if (state.stage !== "delete" || state.deletingBooks[id] === undefined)
			return;
		const deletingBooks = { ...state.deletingBooks };
		delete deletingBooks[id];
		set({
			deletingBooks,
			deletedBookIds: [...state.deletedBookIds, id],
			action: Object.keys(deletingBooks).length ? "running" : "done",
		});
	},
	resetDeletedBooks: () =>
		set({ deletingBooks: {}, deletedBookIds: [], action: "idle" }),
	finishAdd: () => {
		if (get().stage !== "add" || get().action !== "running") return;
		set((state) => ({
			deletedBookIds: state.deletedBookIds.filter(
				(id) => id !== useBookStore.getState().selectedBookId,
			),
			action: "done",
		}));
	},
	blurredBookIds: [],
	toggleBookBlur: (id) =>
		set((state) => ({
			usedHints: [...new Set([...state.usedHints, "censor"])],
			blurredBookIds: state.blurredBookIds.includes(id)
				? state.blurredBookIds.filter((bookId) => bookId !== id)
				: [...state.blurredBookIds, id],
		})),
	toggleAllBlur: () =>
		set((state) => ({
			usedHints: [...new Set([...state.usedHints, "censor"])],
			blurredBookIds:
				state.blurredBookIds.length === books.length
					? []
					: books.map((book) => book.id),
		})),
	start: () => {
		resetEffects();
		get().resetDeletedBooks();
		usePresentationStore.setState({ movingLight: false, blurEnabled: true });
		get().enter("library");
	},
	enter: (stage) => {
		if (get().stage === "delete" && stage !== "delete") {
			set((state) => ({
				deletedBookIds: [
					...new Set([
						...state.deletedBookIds,
						...Object.keys(state.deletingBooks),
					]),
				],
				deletingBooks: {},
			}));
		}
		if (stage !== "pull") set({ returningBookId: null });
		if (["library", "pick", "delete", "add", "end"].includes(stage))
			useLevelStore.getState().startDemo(4, false);
		if (stage === "grow") useLevelStore.getState().startDemo(1, false);
		if (stage === "privacy") set({ blurredBookIds: [] });
		if (stage === "read")
			useReadingStore.setState({ selectedPage: 0, currentPage: 0 });
		if (stage === "delete") {
			get().resetDeletedBooks();
			useDissolveStore.setState({
				dissolveProgress: 0,
				targetProgress: 0,
				isDissolving: false,
			});
		}
		if (stage === "add") {
			const restoreId = get().deletedBookIds.at(-1);
			if (restoreId) useBookStore.getState().selectBook(restoreId);
			useParticleStore.setState({
				phase: "idle",
				particleProgress: 0,
				bookScale: 1,
			});
		}
		set((state) => ({
			stage,
			usedHints: [],
			reader: "closed",
			elapsed: 0,
			ready: false,
			paused: false,
			action: "idle",
			runId: state.runId + 1,
		}));
	},
	openBook: (id, origin) => {
		if (
			!books.some((book) => book.id === id) ||
			!["library", "pick", "end", "read"].includes(get().stage)
		)
			return;
		const previousId = useBookStore.getState().selectedBookId;
		set({
			returningBookId:
				get().stage === "read" && previousId !== id ? previousId : null,
		});
		useBookStore.getState().selectBook(id);
		useReadingStore.setState({
			selectedPage: 0,
			currentPage: 0,
			bookOpen: false,
		});
		set({ origin: origin ?? null });
		get().enter("pull");
	},
	closeBook: () => {
		if (get().stage !== "read" || get().reader !== "closed") return;
		get().enter("return");
		useReadingStore.getState().closeBook();
	},
	advance: () => {
		const { stage, action } = get();
		if (stage === "return") {
			get().enter("library");
			set({ paused: true });
			return;
		}
		if (stage === "pick")
			return get().openBook(useBookStore.getState().selectedBookId);
		if (stage === "end") return get().start();
		if ((stage === "delete" || stage === "add") && action !== "done") return;
		const next = nextTourStage[stage];
		if (next) get().enter(next);
	},
	runAction: () => {
		const { stage, action } = get();
		if (stage === "delete") {
			const remaining = books.find(
				(book) =>
					!get().deletedBookIds.includes(book.id) &&
					get().deletingBooks[book.id] === undefined,
			);
			if (remaining) get().deleteBook(remaining.id);
			return;
		}
		if (action === "running" || stage !== "add") return;
		if (stage === "add") {
			const restoreId = get().deletedBookIds.at(-1);
			if (restoreId) useBookStore.getState().selectBook(restoreId);
			const book =
				books.find(
					(item) => item.id === useBookStore.getState().selectedBookId,
				) ?? books[0];
			useParticleStore.getState().requestBook(book);
		}
		get().dismissHint("add");
		set((state) => ({
			action: "running",
			paused: false,
			ready: false,
			runId: state.runId + 1,
		}));
	},
	togglePause: () =>
		set((state) => ({
			paused: state.reader === "closed" ? !state.paused : true,
		})),
}));
