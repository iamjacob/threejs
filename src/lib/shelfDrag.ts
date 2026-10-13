import type { ShelfDocument } from "./shelfModel";

export type ShelfDrop = { shelf: number; beforeId: string | null };
export type ShelfDrag = {
	id: string;
	ids: string[];
	offset: [number, number, number];
	drop: ShelfDrop;
	moved: boolean;
};

export function expandShelfSelection(document: ShelfDocument, ids: string[]) {
	const selected = new Set(ids.filter((id) => document.items[id]));
	for (const stack of document.stacks)
		if (stack.bookIds.some((id) => selected.has(id)))
			for (const id of stack.bookIds) selected.add(id);
	return document.order.filter((id) => selected.has(id));
}

/** Move complete shelf units; never split a stack or change its vertical order. */
export function moveShelfBooks(
	document: ShelfDocument,
	ids: string[],
	drop: ShelfDrop,
): ShelfDocument {
	if (!Number.isFinite(drop.shelf)) return document;
	const moving = expandShelfSelection(document, ids);
	if (!moving.length) return document;
	const shelf = Math.max(0, Math.min(3, Math.round(drop.shelf)));
	const rest = document.order.filter((id) => !moving.includes(id));
	const targetStack = document.stacks.find((stack) =>
		stack.bookIds.includes(drop.beforeId ?? ""),
	);
	const beforeId = targetStack
		? rest.find((id) => targetStack.bookIds.includes(id))
		: drop.beforeId;
	const index =
		beforeId && document.items[beforeId]?.shelf === shelf
			? rest.indexOf(beforeId)
			: -1;
	const order = [...rest];
	order.splice(index < 0 ? rest.length : index, 0, ...moving);
	// Other rows' global ordering has no visual significance.
	const changed =
		moving.some((id) => document.items[id].shelf !== shelf) ||
		[0, 1, 2, 3].some((row) => {
			const oldRow = document.order.filter(
				(id) => document.items[id].shelf === row,
			);
			const newRow = order.filter(
				(id) =>
					(moving.includes(id) ? shelf : document.items[id].shelf) === row,
			);
			return (
				oldRow.length !== newRow.length ||
				oldRow.some((id, i) => id !== newRow[i])
			);
		});
	if (!changed) return document;
	const items = { ...document.items };
	for (const id of moving) items[id] = { ...items[id], shelf };
	return { ...document, items, order };
}

type DragPointer = { pointerId: number; clientX: number; clientY: number };

/** A tap still selects; only a deliberate movement starts the drag. */
export function createBookDragGesture(callbacks: {
	onStart: () => void;
	onMove: (pointer: DragPointer) => void;
	onEnd: (commit: boolean) => void;
}) {
	let origin: DragPointer | null = null;
	let moved = false;
	let suppressClick = false;
	const finish = (commit: boolean) => {
		if (!origin) return;
		origin = null;
		if (moved) {
			suppressClick = true;
			callbacks.onEnd(commit);
		}
		moved = false;
	};
	return {
		start(pointer: DragPointer & { button: number; isPrimary: boolean }) {
			finish(false);
			suppressClick = false;
			if (pointer.button !== 0 || !pointer.isPrimary) return false;
			origin = {
				pointerId: pointer.pointerId,
				clientX: pointer.clientX,
				clientY: pointer.clientY,
			};
			return true;
		},
		move(pointer: DragPointer) {
			if (origin?.pointerId !== pointer.pointerId) return;
			if (
				!moved &&
				Math.hypot(
					pointer.clientX - origin.clientX,
					pointer.clientY - origin.clientY,
				) >= 6
			) {
				moved = true;
				callbacks.onStart();
			}
			if (moved) callbacks.onMove(pointer);
		},
		end(pointer: Pick<DragPointer, "pointerId">) {
			if (origin?.pointerId === pointer.pointerId) finish(true);
		},
		cancel() {
			finish(false);
		},
		additionalPointer(pointer: Pick<DragPointer, "pointerId">) {
			if (origin && origin.pointerId !== pointer.pointerId) {
				suppressClick = true;
				finish(false);
			}
		},
		consumeClick() {
			const value = suppressClick;
			suppressClick = false;
			return value;
		},
	};
}
