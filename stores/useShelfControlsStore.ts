import { create } from "zustand";
import { expandShelfSelection, moveShelfBooks, type ShelfDrag, type ShelfDrop } from "../src/lib/shelfDrag.ts";
import type { ShelfBook } from "../src/components/shelves/shelfBooks";
import {
	createShelfDocument,
	detachBooks,
	type ShelfDocument,
	type ShelfFace,
	type ShelfGroupBy,
	type ShelfLayout,
	type ShelfView,
	type ShelfZoom,
} from "../src/lib/shelfModel.ts";
export type {
	ShelfFace,
	ShelfGroupBy,
	ShelfLayout,
	ShelfView,
} from "../src/lib/shelfModel.ts";

type Snapshot = {
	document: ShelfDocument;
	selectedIds: string[];
	activeStackId: string | null;
};
type ShelfControlsState = Snapshot & {
	initialized: boolean;
	editing: boolean;
	multiSelect: boolean;
	panel: "arrange" | "stack" | "group" | "settings";
	shelfView: ShelfView;
	zoomMode: ShelfZoom;
	cycleZoom: () => void;
	drag: ShelfDrag | null;
	beginBookDrag: (id: string) => void;
	updateBookDrag: (offset: ShelfDrag["offset"], drop: ShelfDrop) => void;
	endBookDrag: (commit?: boolean) => void;
	viewRevision: number;
	past: Snapshot[];
	future: Snapshot[];
	interaction: Snapshot | null;
	message: string;
	pictureFrameVisible: boolean;
	initialize: (books: ShelfBook[]) => void;
	insertBook: (id: string) => void;
	setEditing: (editing: boolean) => void;
	openBookEditor: (id: string) => void;
	setPanel: (panel: ShelfControlsState["panel"]) => void;
	setMultiSelect: (enabled: boolean) => void;
	selectBook: (id: string) => void;
	selectBooks: (ids: string[]) => void;
	selectStack: (id: string) => void;
	selectGroup: (id: string) => void;
	setAngle: (angle: number) => void;
	stepAngle: (amount: number) => void;
	setLayout: (layout: ShelfLayout) => void;
	setFace: (face: ShelfFace) => void;
	setBookOrientation: (orientation: "cover" | "spine" | "flat") => void;
	setShelfView: (view: ShelfView) => void;
	setSpacing: (spacing: number) => void;
	setAlignment: (alignment: ShelfDocument["alignment"]) => void;
	moveToShelf: (shelf: number) => void;
	nudgeSelection: (direction: "left" | "right" | "up" | "down") => void;
	createStack: () => void;
	moveInStack: (id: string, direction: "up" | "down") => void;
	addToStack: (id: string) => void;
	toggleAlternateSpines: () => void;
	flipStack: () => void;
	reverseStack: () => void;
	unstack: () => void;
	groupSelection: (name: string) => void;
	ungroup: () => void;
	togglePictureFrame: () => void;
	groupBy: (by: ShelfGroupBy, books: ShelfBook[]) => void;
	removeSelection: () => void;
	beginInteraction: () => void;
	endInteraction: () => void;
	undo: () => void;
	redo: () => void;
	reset: (books: ShelfBook[]) => void;
};
const snapshot = (state: Snapshot): Snapshot => ({
	document: state.document,
	selectedIds: state.selectedIds,
	activeStackId: state.activeStackId,
});
const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));
let nextId = 0;

export const useShelfControlsStore = create<ShelfControlsState>((set, get) => {
	const commit = (
		document: ShelfDocument,
		message: string,
		selection: Partial<Snapshot> = {},
	) => {
		const state = get();
		if (state.drag) return;
		set({
			document,
			...selection,
			message,
			past: state.interaction
				? state.past
				: [...state.past, snapshot(state)].slice(-60),
			future: [],
		});
	};
	const updateBooks = (
		update: Partial<ShelfDocument["items"][string]>,
		message: string,
	) => {
		const { document, selectedIds } = get();
		if (!selectedIds.length) return;
		const items = { ...document.items };
		for (const id of selectedIds)
			if (items[id]) items[id] = { ...items[id], ...update };
		commit({ ...document, items }, message);
	};
	const updateStack = (
		update: (
			stack: ShelfDocument["stacks"][number],
		) => ShelfDocument["stacks"][number],
		message: string,
	) => {
		const { document, activeStackId } = get();
		if (!document.stacks.some((stack) => stack.id === activeStackId)) return;
		commit(
			{
				...document,
				stacks: document.stacks.map((stack) =>
					stack.id === activeStackId ? update(stack) : stack,
				),
			},
			message,
		);
	};
	return {
		document: {
			items: {},
			order: [],
			stacks: [],
			groups: [],
			spacing: 0.16,
			alignment: "center",
		},
		selectedIds: [],
		activeStackId: null,
		initialized: false,
		editing: false,
		multiSelect: false,
		panel: "arrange",
		shelfView: "front",
		zoomMode: "book",
		drag: null,
		cycleZoom: () => {
			if (get().drag) return;
			const zoomMode = get().zoomMode === "book" ? "shelf" : get().zoomMode === "shelf" ? "library" : "book";
			set({ zoomMode, viewRevision: get().viewRevision + 1, message: `Zoom: ${zoomMode === "library" ? "all books" : zoomMode}.` });
		},
		beginBookDrag: (id) => {
			const state = get();
			if (!state.editing || state.drag || !state.document.items[id]) return;
			state.endInteraction();
			const ids = expandShelfSelection(state.document, state.selectedIds.includes(id) ? state.selectedIds : [id]);
			const stack = state.document.stacks.find(entry => entry.bookIds.length === ids.length && entry.bookIds.every(bookId => ids.includes(bookId)));
			set({
				drag: { id, ids, offset: [0, 0, 0], drop: { shelf: state.document.items[id].shelf, beforeId: null }, moved: false },
				selectedIds: ids, activeStackId: stack?.id ?? null,
				panel: stack ? "stack" : "arrange",
				viewRevision: state.viewRevision + 1,
				message: "Drag onto a book to stack, or into a gap to move. Escape cancels.",
			});
		},
		updateBookDrag: (offset, drop) => {
			const drag = get().drag;
			if (!drag || !offset.every(Number.isFinite) || !Number.isFinite(drop.shelf)) return;
			set({ drag: { ...drag, offset, drop: { ...drop, shelf: clamp(Math.round(drop.shelf), 0, 3) }, moved: true } });
		},
		endBookDrag: (save = true) => {
			const { drag, document } = get();
			if (!drag) return;
			set({ drag: null });
			const next = save && drag.moved ? moveShelfBooks(document, drag.ids, drag.drop) : document;
			if (next !== document) {
				const stack = drag.drop.stackOnId ? next.stacks.find((entry) => entry.bookIds.includes(drag.drop.stackOnId!)) : null;
				commit(next, stack ? "Added on top of the stack." : `Moved to shelf ${4 - drag.drop.shelf}.`, stack ? { selectedIds: [...stack.bookIds], activeStackId: stack.id } : {});
				if (stack) set({ panel: "stack" });
			}
			else set({ message: save ? "Book placed." : "Move canceled." });
		},
		viewRevision: 0,
		past: [],
		future: [],
		interaction: null,
		message: "Select a book to make it your own.",
		pictureFrameVisible: false,
		togglePictureFrame: () =>
			set((state) => ({ pictureFrameVisible: !state.pictureFrameVisible })),
		initialize: (books) => {
			if (get().initialized) return;
			const document = createShelfDocument(books);
			const selected =
				books.find((book) => book.title === "Stilness is the Key") ?? books[0];
			set({
				document,
				initialized: true,
				selectedIds: selected ? [selected.id] : [],
			});
		},
		insertBook: (id) => {
			const { document } = get();
			if (document.items[id]) return;
			// Choose the least occupied row, keeping the new cover upright and visible.
			const counts = [0, 0, 0, 0];
			for (const item of Object.values(document.items)) counts[item.shelf]++;
			const shelf = counts.indexOf(Math.min(...counts));
			commit({
				...document,
				items: { ...document.items, [id]: { shelf, layout: "upright", angle: 0, face: "cover" } },
				order: [...document.order, id],
			}, "Book added to your shelf.", { selectedIds: [id], activeStackId: null });
		},
		setEditing: (editing) => {
			if (!editing) get().endBookDrag(false);
			set({ editing, multiSelect: false });
		},
		openBookEditor: (id) => {
			get().endBookDrag(false);
			const { document, viewRevision } = get();
			if (!document.items[id]) return;
			const stack = document.stacks.find((entry) => entry.bookIds.includes(id));
			set({
				editing: true,
				multiSelect: false,
				selectedIds: stack ? [...stack.bookIds] : [id],
				activeStackId: stack?.id ?? null,
				panel: stack ? "stack" : "arrange",
				shelfView: "front",
				zoomMode: "book",
				viewRevision: viewRevision + 1,
				message: "Editing selected book.",
			});
		},
		setPanel: (panel) => set({ panel }),
		setMultiSelect: (multiSelect) =>
			set({
				multiSelect,
				activeStackId: null,
				panel: "arrange",
				message: multiSelect
					? "Tap books to add them to your selection."
					: "Selection ready.",
			}),
		selectBook: (id) => {
			const { document, multiSelect, selectedIds } = get();
			if (!document.items[id]) return;
			if (multiSelect) {
				const stack = document.stacks.find((entry) =>
					entry.bookIds.includes(id),
				);
				const ids = stack?.bookIds ?? [id];
				const selected = ids.every((bookId) => selectedIds.includes(bookId));
				set({
					selectedIds: selected
						? selectedIds.filter((bookId) => !ids.includes(bookId))
						: [...new Set([...selectedIds, ...ids])],
					activeStackId: null,
				});
				return;
			}
			const stack = document.stacks.find((entry) => entry.bookIds.includes(id));
			if (stack) get().selectStack(stack.id);
			else set({ selectedIds: [id], activeStackId: null, panel: "arrange" });
		},
		selectBooks: (ids) =>
			set({
				selectedIds: [...new Set(ids)].filter((id) => get().document.items[id]),
				activeStackId: null,
				panel: "arrange",
			}),
		selectStack: (id) => {
			const stack = get().document.stacks.find((entry) => entry.id === id);
			if (stack)
				set({
					activeStackId: id,
					selectedIds: [...stack.bookIds],
					panel: "stack",
					multiSelect: false,
				});
		},
		selectGroup: (id) => {
			const group = get().document.groups.find((entry) => entry.id === id);
			if (group)
				set({
					selectedIds: [...group.bookIds],
					activeStackId: null,
					panel: "arrange",
					multiSelect: false,
				});
		},
		setAngle: (value) => {
			if (!Number.isFinite(value) || get().activeStackId) return;
			const angle = Math.round(clamp(value, -45, 45));
			updateBooks(
				{ angle, layout: angle ? "lean" : "upright" },
				`Tilt set to ${angle}°.`,
			);
		},
		stepAngle: (amount) =>
			get().setAngle(
				(get().document.items[get().selectedIds[0]]?.angle ?? 0) + amount,
			),
		setLayout: (layout) => {
			if (layout === "stack") {
				if (get().activeStackId) set({ panel: "stack" });
				else get().createStack();
				return;
			}
			const { document, selectedIds } = get();
			if (!selectedIds.length) return;
			const next = detachBooks(document, selectedIds);
			const items = { ...next.items };
			selectedIds.forEach((id, index) => {
				items[id] = {
					...items[id],
					layout,
					angle:
						layout === "lean"
							? -10
							: layout === "fan"
								? (index - (selectedIds.length - 1) / 2) *
									Math.min(12, 60 / Math.max(1, selectedIds.length - 1))
								: 0,
				};
			});
			commit(
				{ ...next, items, groups: document.groups },
				`${layout[0].toUpperCase()}${layout.slice(1)} layout applied.`,
				{ activeStackId: null },
			);
			set({ panel: "arrange" });
		},
		setBookOrientation: (orientation) => {
			const { document, selectedIds, drag } = get();
			if (drag || !selectedIds.length) return;
			const ids = expandShelfSelection(document, selectedIds);
			const stacked = document.stacks.some((stack) => stack.bookIds.some((id) => ids.includes(id)));
			// Flat stacks are already lying down; keep their physical order intact.
			if (orientation === "flat" && stacked && ids.every((id) =>
				document.items[id].layout === "flat" || document.stacks.some((stack) => stack.bookIds.includes(id)),
			)) return;
			const layout = orientation === "flat" ? "flat" : "upright";
			const face = orientation === "spine" ? "spine" : "cover";
			if (!stacked && ids.every((id) => {
				const item = document.items[id];
				return item.layout === layout && item.face === face && item.angle === 0;
			})) return;
			const next = detachBooks(document, ids);
			const items = { ...next.items };
			for (const id of ids) items[id] = { ...items[id], layout, face, angle: 0 };
			commit({ ...next, items, groups: document.groups },
				orientation === "flat" ? "Books laid flat." : `Books upright, ${orientation} facing out.`,
				{ selectedIds: ids, activeStackId: null });
			set({ panel: "arrange" });
		},
		setFace: (face) =>
			updateBooks(
				{ face },
				`${face[0].toUpperCase()}${face.slice(1)} facing out.`,
			),
		setShelfView: (shelfView) =>
			set((state) => ({ shelfView, viewRevision: state.viewRevision + 1 })),
		setSpacing: (spacing) => {
			if (Number.isFinite(spacing))
				commit(
					{ ...get().document, spacing: clamp(spacing, 0.03, 0.3) },
					"Shelf spacing updated.",
				);
		},
		setAlignment: (alignment) =>
			commit({ ...get().document, alignment }, `Books aligned ${alignment}.`),
		moveToShelf: (shelf) =>
			updateBooks(
				{ shelf: Math.round(clamp(shelf, 0, 3)) },
				`Moved to shelf ${4 - Math.round(clamp(shelf, 0, 3))}.`,
			),
		nudgeSelection: (direction) => {
			const { document, selectedIds } = get();
			const ids = expandShelfSelection(document, selectedIds);
			if (!ids.length) return;
			const shelf = document.items[ids[0]].shelf;
			let drop: ShelfDrop;
			if (direction === "up" || direction === "down") {
				const target = shelf + (direction === "up" ? 1 : -1);
				if (target < 0 || target > 3) return;
				drop = { shelf: target, beforeId: null };
			} else {
				if (ids.some((id) => document.items[id].shelf !== shelf)) return;
				const seen = new Set<string>();
				const units: string[][] = [];
				for (const id of document.order) {
					if (seen.has(id) || document.items[id].shelf !== shelf) continue;
					const unit = document.stacks.find((stack) => stack.bookIds.includes(id))?.bookIds ?? [id];
					unit.forEach((bookId) => seen.add(bookId));
					units.push(unit);
				}
				const selected = units.flatMap((unit, index) => unit.some((id) => ids.includes(id)) ? [index] : []);
				const edge = direction === "left" ? selected[0] : selected[selected.length - 1];
				if (direction === "left" ? edge === 0 : edge === units.length - 1) return;
				drop = { shelf, beforeId: direction === "left" ? units[edge - 1][0] : units[edge + 2]?.[0] ?? null };
			}
			const next = moveShelfBooks(document, ids, drop);
			if (next !== document) {
				commit(next, `Moved ${direction}.`);
				set({ viewRevision: get().viewRevision + 1 });
			}
		},
		createStack: () => {
			const { document, selectedIds } = get();
			if (selectedIds.length < 2) return;
			const next = detachBooks(document, selectedIds);
			const id = `stack-${++nextId}`;
			const items = { ...next.items };
			const shelf = items[selectedIds[0]].shelf;
			for (const bookId of selectedIds)
				items[bookId] = { ...items[bookId], shelf, angle: 0 };
			commit(
				{
					...next,
					items,
					stacks: [
						...next.stacks,
						{
							id,
							bookIds: [...selectedIds].reverse(),
							alternateSpines: false,
							flipped: false,
						},
					],
				},
				`Stacked ${selectedIds.length} books.`,
				{ activeStackId: id },
			);
			set({ panel: "stack", multiSelect: false });
		},
		moveInStack: (id, direction) => {
			const stack = get().document.stacks.find(
				(entry) => entry.id === get().activeStackId,
			);
			if (!stack) return;
			const index = stack.bookIds.indexOf(id);
			const target = index + (direction === "up" ? 1 : -1);
			if (index < 0 || target < 0 || target >= stack.bookIds.length) return;
			updateStack((current) => {
				const bookIds = [...current.bookIds];
				[bookIds[index], bookIds[target]] = [bookIds[target], bookIds[index]];
				return { ...current, bookIds };
			}, "Stack order updated.");
		},
		addToStack: (id) => {
			const { document, activeStackId } = get();
			const stack = document.stacks.find((entry) => entry.id === activeStackId);
			if (!stack || stack.bookIds.includes(id) || !document.items[id]) return;
			const next = detachBooks(document, [id]);
			const bookIds = [...stack.bookIds, id];
			commit(
				{
					...next,
					items: {
						...next.items,
						[id]: {
							...next.items[id],
							shelf: next.items[stack.bookIds[0]].shelf,
							angle: 0,
						},
					},
					stacks: next.stacks.map((entry) =>
						entry.id === stack.id ? { ...entry, bookIds } : entry,
					),
				},
				"Book added on top.",
				{ selectedIds: bookIds },
			);
		},
		toggleAlternateSpines: () =>
			updateStack(
				(stack) => ({ ...stack, alternateSpines: !stack.alternateSpines }),
				"Alternating spines updated.",
			),
		flipStack: () =>
			updateStack(
				(stack) => ({ ...stack, flipped: !stack.flipped }),
				"Stack flipped.",
			),
		reverseStack: () =>
			updateStack(
				(stack) => ({ ...stack, bookIds: [...stack.bookIds].reverse() }),
				"Stack order reversed.",
			),
		unstack: () => {
			const { document, activeStackId, selectedIds } = get();
			if (!activeStackId) return;
			const items = { ...document.items };
			for (const id of selectedIds)
				items[id] = { ...items[id], layout: "upright", angle: 0 };
			commit(
				{
					...document,
					items,
					stacks: document.stacks.filter((stack) => stack.id !== activeStackId),
				},
				"Books unstacked.",
				{ activeStackId: null },
			);
			set({ panel: "arrange" });
		},
		groupSelection: (name) => {
			const { document, selectedIds } = get();
			if (selectedIds.length < 2 || !name.trim()) return;
			const ids = new Set(selectedIds);
			const groups = document.groups
				.map((group) => ({
					...group,
					bookIds: group.bookIds.filter((id) => !ids.has(id)),
				}))
				.filter((group) => group.bookIds.length > 1);
			const shelf = document.items[selectedIds[0]].shelf;
			const items = { ...document.items };
			for (const id of selectedIds) items[id] = { ...items[id], shelf };
			const insertion = document.order.indexOf(selectedIds[0]);
			const order = document.order.filter((id) => !ids.has(id));
			order.splice(insertion, 0, ...selectedIds);
			commit(
				{
					...document,
					items,
					order,
					groups: [
						...groups,
						{
							id: `group-${++nextId}`,
							name: name.trim().slice(0, 40),
							bookIds: [...selectedIds],
						},
					],
				},
				`Created “${name.trim()}”.`,
			);
			set({ panel: "arrange", multiSelect: false });
		},
		ungroup: () => {
			const { document, selectedIds } = get();
			commit(
				{
					...document,
					groups: document.groups.filter(
						(group) => !group.bookIds.some((id) => selectedIds.includes(id)),
					),
				},
				"Books ungrouped.",
			);
		},
		groupBy: (by, books) => {
			const { document } = get();
			if (by === "none")
				return commit({ ...document, groups: [] }, "Groups cleared.");
			const available = books.filter((book) => document.items[book.id]);
			available.sort((a, b) =>
				by === "height"
					? b.dimensions[1] - a.dimensions[1]
					: String(a.author).localeCompare(String(b.author)),
			);
			const items = { ...document.items };
			available.forEach((book, index) => {
				items[book.id] = {
					...items[book.id],
					shelf:
						3 -
						Math.min(3, Math.floor(index / Math.ceil(available.length / 4))),
				};
			});
			const groups: ShelfDocument["groups"] = [];
			if (by === "author") {
				for (const book of available) {
					const name = String(book.author).trim();
					if (!name) continue;
					const group = groups.find((entry) => entry.name === name);
					if (group) group.bookIds.push(book.id);
					else
						groups.push({ id: `author-${++nextId}`, name, bookIds: [book.id] });
				}
			}
			commit(
				{
					...document,
					items,
					order: available.map((book) => book.id),
					stacks: [],
					groups: groups.filter((group) => group.bookIds.length > 1),
				},
				by === "author"
					? "Books grouped by author."
					: "Books sorted by height.",
				{ activeStackId: null },
			);
			set({ panel: "arrange" });
		},
		removeSelection: () => {
			const { document, selectedIds } = get();
			if (!selectedIds.length) return;
			const next = detachBooks(document, selectedIds);
			const items = { ...next.items };
			for (const id of selectedIds) delete items[id];
			commit(
				{
					...next,
					items,
					order: next.order.filter((id) => !selectedIds.includes(id)),
				},
				`Removed ${selectedIds.length} ${selectedIds.length === 1 ? "book" : "books"}. Undo to restore.`,
				{ selectedIds: [], activeStackId: null },
			);
			set({ panel: "arrange" });
		},
		beginInteraction: () => {
			if (!get().interaction) set({ interaction: snapshot(get()) });
		},
		endInteraction: () => {
			const { interaction, document, past } = get();
			if (!interaction) return;
			set({
				interaction: null,
				past:
					interaction.document === document
						? past
						: [...past, interaction].slice(-60),
			});
		},
		undo: () => {
			if (get().drag) { get().endBookDrag(false); return; }
			get().endInteraction();
			const state = get();
			const previous = state.past.at(-1);
			if (previous)
				set({
					...previous,
					past: state.past.slice(0, -1),
					future: [snapshot(state), ...state.future],
					panel: previous.activeStackId ? "stack" : "arrange",
					message: "Change undone.",
				});
		},
		redo: () => {
			if (get().drag) { get().endBookDrag(false); return; }
			const state = get();
			const next = state.future[0];
			if (next)
				set({
					...next,
					past: [...state.past, snapshot(state)],
					future: state.future.slice(1),
					panel: next.activeStackId ? "stack" : "arrange",
					message: "Change redone.",
				});
		},
		reset: (books) => {
			commit(createShelfDocument(books), "Original arrangement restored.", {
				selectedIds: [],
				activeStackId: null,
			});
			set({
				panel: "arrange",
				multiSelect: false,
				shelfView: "front",
				viewRevision: get().viewRevision + 1,
			});
		},
	};
});
