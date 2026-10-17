"use client";
import { create } from "zustand";
export interface ReadingPosition {
	index: number;
	fraction: number;
}
export interface RibbonBookmark extends ReadingPosition {
	id: string;
	color: string;
	insertedAt: number;
 launch?: { x: number; y: number };
}
const ribbonColors = [
	"#c91d4e",
	"#167dcc",
	"#d99a16",
	"#23956a",
	"#8b4fcd",
	"#e76e35",
	"#c044a3",
	"#168f9d",
];
const valid = (p: unknown): p is ReadingPosition =>
	Boolean(
		p &&
			typeof p === "object" &&
			Number.isInteger((p as ReadingPosition).index) &&
			(p as ReadingPosition).index >= 0 &&
			Number.isFinite((p as ReadingPosition).fraction) &&
			(p as ReadingPosition).fraction >= 0 &&
			(p as ReadingPosition).fraction <= 1,
	);
export interface ReadingState {
	bookId: string | null;
	selectedPage: number;
	currentPage: number;
	fraction: number;
	bookOpen: boolean;
	bookmark: RibbonBookmark | null;
	bookmarks: RibbonBookmark[];
	ribbonSequence: number;
	revision: number;
	activateBook: (id: string) => void;
	setSelectedPage: (page: number) => void;
	setCurrentPage: (page: number) => void;
	receivePosition: (position: ReadingPosition) => void;
	toggleBookmark: (launch?: {x:number;y:number}) => void;
	visitBookmark: (id?: string) => void;
	openBook: () => void;
	closeBook: () => void;
	goToPage: (page: number, options?: { open?: boolean }) => void;
}
export const useReadingStore = create<ReadingState>()((set, get) => ({
	bookId: null,
	selectedPage: 0,
	currentPage: 0,
	fraction: 0,
	bookOpen: false,
	bookmark: null,
	bookmarks: [],
	ribbonSequence: 0,
	revision: 0,
	activateBook(id) {
		if (get().bookId === id) return;
		let saved: {
			position?: ReadingPosition;
			bookmark?: ReadingPosition;
			bookmarks?: RibbonBookmark[];
			ribbonSequence?: number;
		} = {};
		try {
			saved =
				JSON.parse(localStorage.getItem(`boooks-reading:${id}`) || "{}") || {};
		} catch {}
		const candidates = Array.isArray(saved.bookmarks)
			? saved.bookmarks
			: valid(saved.bookmark)
				? [saved.bookmark]
				: [];
		const bookmarks: RibbonBookmark[] = candidates
			.filter(valid)
			.map((entry, i) => {
				const b = entry as Partial<RibbonBookmark>;
				return {
					...entry,
					id: typeof b.id === "string" ? b.id : `legacy-${i}`,
					color:
						typeof b.color === "string" && /^#[0-9a-f]{6}$/i.test(b.color)
							? b.color
							: ribbonColors[i % ribbonColors.length],
					insertedAt: 0,
				};
			});
		const position = valid(saved.position)
			? saved.position
			: { index: 0, fraction: 0 };
		set({
			bookId: id,
			selectedPage: position.index,
			currentPage: position.index,
			fraction: position.fraction,
			bookmarks,
			bookmark: bookmarks.at(-1) ?? null,
			ribbonSequence:
				Number.isSafeInteger(saved.ribbonSequence) && saved.ribbonSequence! >= 0
					? saved.ribbonSequence!
					: bookmarks.length,
			bookOpen: false,
		});
	},
	setSelectedPage(page) {
		if (Number.isInteger(page) && page >= 0 && page !== get().selectedPage)
			set({ selectedPage: page, fraction: 0, revision: get().revision + 1 });
	},
	setCurrentPage: (page) => set({ currentPage: page }),
	receivePosition(position) {
		if (valid(position))
			set({
				selectedPage: position.index,
				currentPage: position.index,
				fraction: position.fraction,
			});
	},
	toggleBookmark(launch) {
		const s = get();
		const existing = s.bookmarks.find((b) => b.index === s.selectedPage);
		const bookmarks = existing
			? s.bookmarks.filter((b) => b.id !== existing.id)
			: [
					...s.bookmarks,
					{
						id: `${Date.now()}-${s.ribbonSequence}`,
						index: s.selectedPage,
						fraction: s.fraction,
						color: ribbonColors[s.ribbonSequence % ribbonColors.length],
						insertedAt: Date.now(),
 launch,
					},
				];
		set({
			bookmarks,
			bookmark: bookmarks.at(-1) ?? null,
			ribbonSequence: s.ribbonSequence + (existing ? 0 : 1),
		});
	},
	visitBookmark(id) {
		const b = id ? get().bookmarks.find((b) => b.id === id) : get().bookmark;
		if (b)
			set({
				selectedPage: b.index,
				fraction: b.fraction,
				revision: get().revision + 1,
			});
	},
	openBook: () => set({ bookOpen: true }),
	closeBook: () => set({ bookOpen: false }),
	goToPage(page, { open = true } = {}) {
		get().setSelectedPage(page);
		if (open) set({ bookOpen: true });
	},
}));
useReadingStore.subscribe((s, p) => {
	if (
		!s.bookId ||
		(s.selectedPage === p.selectedPage &&
			s.fraction === p.fraction &&
			s.bookmarks === p.bookmarks &&
			s.bookId === p.bookId)
	)
		return;
	try {
		localStorage.setItem(
			`boooks-reading:${s.bookId}`,
			JSON.stringify({
				position: { index: s.selectedPage, fraction: s.fraction },
				bookmark: s.bookmark,
				bookmarks: s.bookmarks,
				ribbonSequence: s.ribbonSequence,
			}),
		);
	} catch {}
});
