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
	closeReader: () => set({ reader: "closed", paused: true }),
	runId: 0,
	action: "idle",
	origin: null,
	returningBookId: null,
	blurredBookIds: [],
	toggleBookBlur: (id) =>
		set((state) => ({
			blurredBookIds: state.blurredBookIds.includes(id)
				? state.blurredBookIds.filter((bookId) => bookId !== id)
				: [...state.blurredBookIds, id],
		})),
	toggleAllBlur: () =>
		set((state) => ({
			blurredBookIds:
				state.blurredBookIds.length === books.length
					? []
					: books.map((book) => book.id),
		})),
	start: () => {
		resetEffects();
		usePresentationStore.setState({ movingLight: false, blurEnabled: true });
		get().enter("library");
	},
	enter: (stage) => {
		if (stage !== "pull") set({ returningBookId: null });
		if (stage === "library" || stage === "end")
			useLevelStore.getState().startDemo(4, false);
		if (stage === "grow") useLevelStore.getState().startDemo(1, false);
		if (stage === "privacy") set({ blurredBookIds: [] });
		if (stage === "read")
			useReadingStore.setState({ selectedPage: 0, currentPage: 0 });
		if (stage === "delete")
			useDissolveStore.setState({
				dissolveProgress: 0,
				targetProgress: 0,
				isDissolving: false,
			});
		if (stage === "add")
			useParticleStore.setState({
				phase: "idle",
				particleProgress: 0,
				bookScale: 1,
			});
		set((state) => ({
			stage,
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
			!["library", "end", "read"].includes(get().stage)
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
		if (stage === "library")
			return get().openBook(useBookStore.getState().selectedBookId);
		if (stage === "end") return get().start();
		if ((stage === "delete" || stage === "add") && action !== "done") return;
		const next = nextTourStage[stage];
		if (next) get().enter(next);
	},
	runAction: () => {
		const { stage, action } = get();
		if (action === "running" || (stage !== "delete" && stage !== "add")) return;
		if (stage === "delete")
			useDissolveStore.setState({
				dissolveProgress: 0,
				targetProgress: 1,
				isDissolving: true,
			});
		if (stage === "add") {
			const book =
				books.find(
					(item) => item.id === useBookStore.getState().selectedBookId,
				) ?? books[0];
			useParticleStore.getState().requestBook(book);
		}
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
