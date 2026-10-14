import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import { createBookDragGesture, moveShelfBooks } from "../src/lib/shelfDrag.ts";
import { getShelfBooks } from "../src/components/shelves/shelfBooks.ts";
import { arrangeShelfBooks, arrangedBookPose, arrangedBooksBounds, frameShelfEditor } from "../src/components/shelves/shelfArrangement.ts";
import { createShelfDragProjector, createShelfStackTargeter, shelfDropForPoint, shelfFloorY } from "../src/components/shelves/shelfDragGeometry.ts";
import { useShelfControlsStore as store } from "../stores/useShelfControlsStore.ts";

const books = getShelfBooks(JSON.parse(readFileSync(new URL("../public/books.json", import.meta.url), "utf8")));
const state = () => store.getState();
const idOf = title => books.find(book => book.title === title).id;
const placements = () => arrangeShelfBooks(books, state().document);
const pointer = (x = 0, y = 0, id = 1) => ({ pointerId: id, clientX: x, clientY: y, button: 0, isPrimary: true });
const gestureFixture = () => {
	const events = [];
	return { events, gesture: createBookDragGesture({ onStart: () => events.push("start"), onMove: () => events.push("move"), onEnd: commit => events.push(commit ? "drop" : "cancel") }) };
};
beforeEach(() => {
	store.setState({ initialized: false, editing: true, drag: null, zoomMode: "book", selectedIds: [], activeStackId: null, past: [], future: [], interaction: null, multiSelect: false });
	state().initialize(books);
});

test("a tap or finger jitter selects without starting a drag", () => {
	const { gesture, events } = gestureFixture();
	gesture.start(pointer()); gesture.move(pointer(2, 3)); gesture.end(pointer(2, 3));
	assert.deepEqual(events, []); assert.equal(gesture.consumeClick(), false);
});
test("drag starts once after deliberate movement, commits on release, and suppresses the click", () => {
	const { gesture, events } = gestureFixture();
	gesture.start(pointer()); gesture.move(pointer(7)); gesture.move(pointer(20)); gesture.end(pointer(20));
	assert.deepEqual(events, ["start", "move", "move", "drop"]);
	assert.equal(gesture.consumeClick(), true); assert.equal(gesture.consumeClick(), false);
});
test("cancel and a second finger abort a drag instead of dropping it", () => {
	for (const cancel of [gesture => gesture.cancel(), gesture => gesture.additionalPointer(pointer(10, 10, 2))]) {
		const { gesture, events } = gestureFixture();
		gesture.start(pointer()); gesture.move(pointer(8)); cancel(gesture); gesture.end(pointer(50));
		assert.deepEqual(events, ["start", "move", "cancel"]);
		assert.equal(gesture.consumeClick(), true);
	}
});
test("secondary buttons and unrelated pointers cannot move a book", () => {
	const { gesture, events } = gestureFixture();
	assert.equal(gesture.start({ ...pointer(), button: 2 }), false);
	assert.equal(gesture.start({ ...pointer(), isPrimary: false }), false);
	gesture.start(pointer()); gesture.move(pointer(40, 0, 2)); gesture.end(pointer(40, 0, 2));
	assert.deepEqual(events, []);
	gesture.cancel();
});
test("drag previews do not mutate the document and a drop is one undoable change", () => {
	const id = idOf("Stilness is the Key");
	const original = state().document;
	state().beginBookDrag(id);
	for (let i = 0; i < 15; i++) state().updateBookDrag([i / 20, -1, .2], { shelf: 2, beforeId: idOf("BEHAVE") });
	assert.equal(state().document, original); assert.equal(state().past.length, 0);
	state().endBookDrag();
	assert.equal(state().drag, null); assert.equal(state().past.length, 1);
	assert.equal(state().document.items[id].shelf, 2);
	assert.equal(state().document.items[id].angle, -10);
	const moved = state().document;
	state().undo(); assert.equal(state().document, original);
	state().redo(); assert.equal(state().document, moved);
	const book = placements().find(entry => entry.book.id === id);
	assert.ok(Math.abs(arrangedBooksBounds([book]).min.y - shelfFloorY(2)) < 1e-7);
});
test("dragging reorders books within a row without disturbing other shelves", () => {
	const id = idOf("Seneca");
	const first = idOf("Discipline is Destiny");
	const original = placements().filter(entry => entry.shelfIndex !== 3);
	state().beginBookDrag(id); state().updateBookDrag([-1, 0, .2], { shelf: 3, beforeId: first }); state().endBookDrag();
	const row = state().document.order.filter(key => state().document.items[key].shelf === 3);
	assert.equal(row[0], id); assert.equal(row[1], first);
	assert.deepEqual(placements().filter(entry => entry.shelfIndex !== 3), original);
});
test("cancel, closing the editor and undo during a drag preserve the original arrangement", () => {
	for (const cancel of [() => state().endBookDrag(false), () => state().setEditing(false), () => state().undo()]) {
		state().setEditing(true);
		const original = state().document;
		state().beginBookDrag(idOf("BEHAVE")); state().updateBookDrag([1, 1, .2], { shelf: 3, beforeId: null }); cancel();
		assert.equal(state().document, original); assert.equal(state().drag, null); assert.equal(state().past.length, 0);
	}
});
test("grabbing one stacked book moves the whole stack with its internal order intact", () => {
	const stack = state().document.stacks[0];
	const originalOrder = [...stack.bookIds];
	state().beginBookDrag(stack.bookIds[1]);
	assert.deepEqual(new Set(state().drag.ids), new Set(originalOrder));
	state().updateBookDrag([1, 2, .2], { shelf: 3, beforeId: null }); state().endBookDrag();
	assert.deepEqual(state().document.stacks[0].bookIds, originalOrder);
	for (const id of originalOrder) assert.equal(state().document.items[id].shelf, 3);
	const pile = placements().filter(entry => entry.stackId === stack.id).sort((a, b) => a.position[1] - b.position[1]);
	assert.deepEqual(pile.map(entry => entry.book.id), originalOrder);
});
test("dropping before any member of a stack inserts before the complete stack", () => {
	const document = state().document;
	const stack = document.stacks[0];
	const id = idOf("BEHAVE");
	const moved = moveShelfBooks(document, [id], { shelf: 1, beforeId: stack.bookIds[1] });
	assert.ok(moved.order.indexOf(id) < Math.min(...stack.bookIds.map(key => moved.order.indexOf(key))));
	assert.deepEqual(moved.stacks, document.stacks);
	assert.equal(new Set(moved.order).size, books.length);
});

test("dropping a book onto a stack adds it on top at full size and is one undoable change", () => {
	const id = idOf("Four Thousand Weeks");
	const target = state().document.stacks[0];
	const before = state().document;
	state().beginBookDrag(id);
	const drop = { shelf: 1, beforeId: null, stackOnId: target.bookIds.at(-1) };
	state().updateBookDrag([-1, 0.4, 0.2], drop);
	const preview = moveShelfBooks(before, [id], drop);
	assert.equal(state().document, before, "Hover is only a preview");
	assert.deepEqual(preview.stacks[0].bookIds, [...target.bookIds, id]);
	state().endBookDrag();
	assert.deepEqual(state().document, preview);
	assert.equal(state().past.length, 1);
	assert.equal(state().activeStackId, target.id);
	assert.deepEqual(state().selectedIds, [...target.bookIds, id]);
	const pile = placements().filter((entry) => entry.stackId === target.id).sort((a, b) => a.position[1] - b.position[1]);
	assert.equal(pile.at(-1).book.id, id);
	for (const book of pile) assert.equal(book.scale, 1);
	for (let i = 1; i < pile.length; i++) assert.ok(arrangedBooksBounds([pile[i]]).min.y > arrangedBooksBounds([pile[i - 1]]).max.y);
	state().undo(); assert.deepEqual(state().document, before);
	state().redo(); assert.deepEqual(state().document, preview);
});

test("dropping onto a single book creates a stack, and a moved stack keeps its bottom-to-top order", () => {
	const id = idOf("Four Thousand Weeks"), targetId = idOf("THE SOURCE");
	const original = state().document;
	const result = moveShelfBooks(original, [id], { shelf: 1, beforeId: null, stackOnId: targetId });
	const target = result.stacks.find((stack) => stack.bookIds.includes(targetId));
	assert.deepEqual(target.bookIds, [targetId, id]);
	const source = original.stacks[0];
	const merged = moveShelfBooks(result, [source.bookIds[1]], { shelf: 1, beforeId: null, stackOnId: id });
	assert.equal(merged.stacks.length, 1);
	assert.deepEqual(merged.stacks[0].bookIds, [targetId, id, ...source.bookIds]);
	assert.equal(new Set(merged.order).size, books.length);
	assert.equal(merged.order.length, books.length);
	for (const bookId of merged.stacks[0].bookIds) assert.equal(merged.items[bookId].shelf, 1);
});

test("stack drops ignore self and missing targets and cancellation leaves the shelf unchanged", () => {
	const document = state().document;
	const stack = document.stacks[0];
	for (const targetId of [stack.bookIds[1], "missing"]) {
		assert.equal(moveShelfBooks(document, [stack.bookIds[0]], { shelf: 1, beforeId: null, stackOnId: targetId }), document);
	}
	state().beginBookDrag(idOf("Four Thousand Weeks"));
	state().updateBookDrag([-1, 0.3, 0.2], { shelf: 1, beforeId: null, stackOnId: stack.bookIds[0] });
	state().endBookDrag(false);
	assert.equal(state().document, document);
	assert.equal(state().past.length, 0);
});

test("screen-space stack targets accept a book face or just above it and leave gaps for reordering", () => {
	const all = placements(), id = idOf("Four Thousand Weeks");
	const stack = state().document.stacks[0];
	const bounds = arrangedBooksBounds(all.filter((entry) => stack.bookIds.includes(entry.book.id)));
	const center = bounds.getCenter(new Vector3());
	const camera = new PerspectiveCamera(45, 1, 0.01, 100);
	camera.position.copy(center).add(new Vector3(0, 0.15, 3));
	camera.lookAt(center); camera.updateMatrixWorld();
	const toPointer = (point) => { const p = point.clone().project(camera); return pointer((p.x + 1) * 250, (1 - p.y) * 250); };
	const pick = createShelfStackTargeter(camera, { left: 0, top: 0, width: 500, height: 500 }, all, [id]);
	const hit = pick(toPointer(center));
	assert.ok(stack.bookIds.includes(hit.stackOnId));
	assert.equal(hit.shelf, 1);
	const above = toPointer(new Vector3(center.x, bounds.max.y, bounds.max.z)); above.clientY -= 12;
	assert.ok(stack.bookIds.includes(pick(above)?.stackOnId));
	assert.equal(pick(pointer(-1000, -1000)), null);
	assert.equal(pick(toPointer(new Vector3(...arrangedBookPose(all.find((entry) => entry.book.id === id)).position))), null, "Cannot stack onto the dragged book");
	const savedPointer = toPointer(center);
	camera.position.x += 5; camera.updateMatrixWorld();
	assert.deepEqual(pick(savedPointer), hit, "Hit targets use the pickup camera");
});
test("multi-selection drags as a unit and automatically includes complete stacks", () => {
	const stack = state().document.stacks[0];
	const id = idOf("BEHAVE");
	state().selectBooks([id, stack.bookIds[0]]); state().beginBookDrag(id);
	assert.equal(state().drag.ids.length, stack.bookIds.length + 1);
	state().updateBookDrag([0, -1, .2], { shelf: 0, beforeId: null }); state().endBookDrag();
	for (const key of [id, ...stack.bookIds]) assert.equal(state().document.items[key].shelf, 0);
});
test("dragging is edit-only and a no-op drop does not create history", () => {
	state().setEditing(false); state().beginBookDrag(idOf("BEHAVE")); assert.equal(state().drag, null);
	state().setEditing(true);
	const id = idOf("BEHAVE"), original = state().document;
	state().beginBookDrag(id); state().updateBookDrag([0, 0, .2], { shelf: 2, beforeId: idOf("Small Data") }); state().endBookDrag();
	assert.equal(state().document, original); assert.equal(state().past.length, 0);
});
test("drop hit testing chooses the shelf and adjacent slot, with safe edge clamping", () => {
	const all = placements(); const id = idOf("BEHAVE");
	assert.equal(shelfDropForPoint(all, [id], -100, shelfFloorY(2)).beforeId, idOf("THE DAILY STOIC"));
	assert.deepEqual(shelfDropForPoint(all, [id], 100, shelfFloorY(2)), { shelf: 2, beforeId: null });
	assert.equal(shelfDropForPoint(all, [id], 0, -100).shelf, 0);
	assert.equal(shelfDropForPoint(all, [id], 0, 100).shelf, 3);
	const point = arrangedBookPose(all.find(entry => entry.book.id === id)).position;
	assert.notEqual(shelfDropForPoint(all, [id], point[0], shelfFloorY(2)).beforeId, id);
});
test("camera movement cannot feed back into the drag projection", () => {
	const camera = new PerspectiveCamera(45, 1, .01, 100);
	camera.position.set(0, 0, 0); camera.lookAt(0, 0, -7); camera.updateMatrixWorld();
	const project = createShelfDragProjector(camera, { left: 0, top: 0, width: 500, height: 500 }, new Vector3(0, 0, -7), pointer(250, 250));
	const before = project(pointer(300, 190));
	camera.position.set(3, 2, 1); camera.lookAt(3, 2, -7); camera.updateMatrixWorld();
	assert.deepEqual(project(pointer(300, 190)), before);
	assert.ok(before.x > 0 && before.y > 0);
	assert.equal(before.z, 0);
});
test("one-tap zoom cycles Book, Shelf, All and each mode frames the appropriate real bounds", () => {
	const id = idOf("BEHAVE"); state().selectBook(id);
	const all = placements();
	for (const [width, height] of [[390, 844], [1440, 900]]) {
		const book = frameShelfEditor(all, [id], "book", width, height);
		const row = frameShelfEditor(all, [id], "shelf", width, height);
		const library = frameShelfEditor(all, [id], "library", width, height);
		assert.ok(row.distance > book.distance); assert.ok(library.distance >= row.distance);
		assert.ok(book.target.distanceTo(new Vector3(...arrangedBookPose(all.find(entry => entry.book.id === id)).position)) < 1e-7);
	}
	for (const mode of ["shelf", "library", "book"]) { state().cycleZoom(); assert.equal(state().zoomMode, mode); }
	assert.equal(state().past.length, 0);
});
