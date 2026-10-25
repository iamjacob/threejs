import type { Object3D } from "three";
import { create } from "zustand";
import {
	type AuraBook,
	type AuraPatch,
	type AuraSearch,
	applyPatch,
	patchKey,
	resolveFocusId,
	type ShareScope,
	type ShelfId,
	shelfItems,
} from "./mockData";
import { auraMotion, clamp } from "./motion";
import { type AuraStyleName, isAuraStyle } from "./styles";

export type BookRef = {
	object: Object3D;
	dimensions: [number, number, number];
};

type FocusState = {
	shelf: ShelfId;
	share: ShareScope;
	style: AuraStyleName;
	focusedId: string | null;
	cursor: number;
	focusedByShelf: Record<ShelfId, string | null>;
	patches: Record<string, AuraPatch>;
	refs: Map<string, BookRef>;
	setShelf: (shelf: ShelfId) => void;
	setShare: (share: ShareScope) => void;
	setStyle: (style: AuraStyleName) => void;
	focusIndex: (index: number) => void;
	clear: () => void;
	step: (delta: number) => void;
	patchFocused: (patch: AuraPatch) => void;
	register: (id: string, ref: BookRef | null) => void;
};

function itemsNow(shelf: ShelfId, share: ShareScope) {
	return shelfItems(shelf, share);
}

export const useAuraFocus = create<FocusState>((set, get) => ({
	shelf: "me",
	share: "likes",
	style: "aurora",
	focusedId: null,
	cursor: 0,
	focusedByShelf: { me: null, freja: null },
	patches: {},
	refs: new Map(),
	setShelf: (shelf) => {
		const items = itemsNow(shelf, get().share);
		const id = get().focusedByShelf[shelf];
		const cursor = id
			? Math.max(
					0,
					items.findIndex((item) => item.bookId === id),
				)
			: 0;
		auraMotion.snap = true;
		auraMotion.scrolling = false;
		set({ shelf, focusedId: id, cursor: id ? cursor : 0 });
	},
	setShare: (share) => set({ share }),
	setStyle: (style) => {
		if (isAuraStyle(style)) set({ style });
	},
	focusIndex: (index) => {
		const { shelf, share } = get();
		const items = itemsNow(shelf, share);
		if (!items.length) return;
		const cursor = clamp(Math.round(index), 0, items.length - 1);
		const id = items[cursor]?.bookId ?? null;
		if (id === get().focusedId && cursor === get().cursor) return;
		set((state) => ({
			focusedId: id,
			cursor,
			focusedByShelf: { ...state.focusedByShelf, [shelf]: id },
		}));
	},
	clear: () => {
		if (get().focusedId === null) return;
		const shelf = get().shelf;
		set((state) => ({
			focusedId: null,
			focusedByShelf: { ...state.focusedByShelf, [shelf]: null },
		}));
	},
	step: (delta) => {
		auraMotion.scrolling = false;
		const { focusedId, cursor, shelf, share } = get();
		const items = itemsNow(shelf, share);
		const base = focusedId
			? items.findIndex((item) => item.bookId === focusedId)
			: cursor;
		get().focusIndex((base < 0 ? 0 : base) + delta);
	},
	patchFocused: (patch) => {
		const { focusedId, shelf, patches } = get();
		if (!focusedId) return;
		const key = patchKey(shelf, focusedId);
		set({ patches: { ...patches, [key]: { ...patches[key], ...patch } } });
	},
	register: (id, ref) => {
		const refs = get().refs;
		if (ref) refs.set(id, ref);
		else refs.delete(id);
	},
}));

export function bootAura(search: AuraSearch) {
	const share = search.share ?? "likes";
	const shelf = search.shelf ?? "me";
	const style = search.style ?? "aurora";
	const me = shelfItems("me", share);
	const freja = shelfItems("freja", share);
	const active = shelf === "me" ? me : freja;
	const focusedId = resolveFocusId(active, search.focus);
	const cursor = focusedId
		? Math.max(
				0,
				active.findIndex((item) => item.bookId === focusedId),
			)
		: 0;
	useAuraFocus.setState({
		shelf,
		share,
		style,
		focusedId,
		cursor,
		focusedByShelf: {
			me: shelf === "me" ? focusedId : (me[0]?.bookId ?? null),
			freja: shelf === "freja" ? focusedId : (freja[0]?.bookId ?? null),
		},
		patches: {},
	});
	auraMotion.vis = cursor;
	auraMotion.scrolling = false;
	auraMotion.snap = true;
	auraMotion.dragMoved = false;
	auraMotion.frozenTime = search.t;
}

export function useAuraItems(): AuraBook[] {
	const shelf = useAuraFocus((state) => state.shelf);
	const share = useAuraFocus((state) => state.share);
	const patches = useAuraFocus((state) => state.patches);
	return shelfItems(shelf, share).map((item) =>
		applyPatch(item, patches[patchKey(shelf, item.bookId)]),
	);
}
