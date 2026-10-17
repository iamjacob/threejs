import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, beforeEach } from "node:test";
import { Box3, Euler, Matrix4, Quaternion, Vector3 } from "three";
import {
	getShelfBooks,
	SHELF_THICKNESS,
	SHELF_SPACING,
} from "../src/components/shelves/shelfBooks.ts";
import {
	arrangeShelfBooks,
	arrangedBookPose,
	arrangedBooksBounds,
	frameShelfSelection,
} from "../src/components/shelves/shelfArrangement.ts";
import { useShelfControlsStore as store } from "../stores/useShelfControlsStore.ts";

const books = getShelfBooks(
	JSON.parse(
		readFileSync(
			new URL("../public/books.json", import.meta.url),
			"utf8",
		),
	),
);
const idOf = (title) => books.find((book) => book.title === title).id;
const state = () => store.getState();
const placements = () => arrangeShelfBooks(books, state().document);
const stack = () =>
	state().document.stacks.find((entry) => entry.id === state().activeStackId);
const closeTo = (actual, expected, message) =>
	assert.ok(
		Math.abs(actual - expected) < 1e-7,
		`${message}: ${actual} != ${expected}`,
	);
function bounds(placement) {
	const [w, h, d] = placement.book.dimensions;
	return new Box3(
		new Vector3(-w / 2, -h / 2, -d / 2),
		new Vector3(w / 2, h / 2, d / 2),
	).applyMatrix4(
		new Matrix4().compose(
			new Vector3(...placement.position),
			new Quaternion().setFromEuler(new Euler(...placement.rotation)),
			new Vector3().setScalar(placement.scale),
		),
	);
}
function validateDocument() {
	const { document, selectedIds, activeStackId } = state();
	assert.equal(new Set(document.order).size, document.order.length);
	assert.deepEqual(
		[...Object.keys(document.items)].sort(),
		[...document.order].sort(),
	);
	const membership = document.stacks.flatMap((entry) => entry.bookIds);
	assert.equal(
		new Set(membership).size,
		membership.length,
		"A book cannot belong to two stacks",
	);
	for (const entry of document.stacks) {
		assert.ok(entry.bookIds.length >= 2);
		assert.equal(
			new Set(entry.bookIds.map((id) => document.items[id]?.shelf)).size,
			1,
			"Stack books stay on one shelf",
		);
	}
	for (const id of [
		...membership,
		...selectedIds,
		...document.groups.flatMap((entry) => entry.bookIds),
	])
		assert.ok(document.items[id], `Stale book reference: ${id}`);
	if (activeStackId) assert.ok(stack(), "Selected stack still exists");
	assert.equal(placements().length, document.order.length);
}

beforeEach(() => {
	store.setState({
		initialized: false,
		deletingIds: [],
		deleteCompletedIds: [],
		past: [],
		future: [],
		interaction: null,
		selectedIds: [],
		activeStackId: null,
		multiSelect: false,
		panel: "arrange",
	});
	state().initialize(books);
});

test("deletion survives initialization and undo/redo updates browser storage", (t) => {
	const values = new Map();
	const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
	t.after(() => {
		if (original) Object.defineProperty(globalThis, "localStorage", original);
		else delete globalThis.localStorage;
	});
	Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
	} });
	const id = idOf("Shaolin spirit");
	const key = "boooks-removed-books-v1";
	state().selectBook(id);
	state().removeSelection();
	assert.deepEqual(JSON.parse(values.get(key)), [id]);
	state().undo();
	assert.deepEqual(JSON.parse(values.get(key)), []);
	state().redo();
	assert.deepEqual(JSON.parse(values.get(key)), [id]);
	store.setState({ initialized: false });
	state().initialize(books);
	assert.equal(state().document.items[id], undefined);
	validateDocument();
});

test("editor delete waits for every dissolve, then removes the stack in one undo step", () => {
	state().selectStack("business-stack");
	const ids = [...state().selectedIds];
	const previous = structuredClone(state().document);
	state().startDeleteSelection();
	assert.deepEqual(new Set(state().deletingIds), new Set(ids));
	assert.deepEqual(state().document, previous);
	for (const id of ids.slice(0, -1)) state().finishDeleteBook(id);
	assert.deepEqual(state().document, previous);
	state().finishDeleteBook(ids.at(-1));
	for (const id of ids) assert.equal(state().document.items[id], undefined);
	assert.equal(state().past.length, 1);
	state().undo();
	assert.deepEqual(state().document, previous);
	state().startDeleteSelection();
	state().undo();
	for (const id of ids) state().finishDeleteBook(id);
	assert.deepEqual(state().document, previous, "Canceled animations cannot delete restored books");
	assert.deepEqual(state().deletingIds, []);
});

test("initial arrangement contains each catalog book exactly once and a real three-book stack", () => {
	validateDocument();
	assert.equal(state().document.order.length, books.length);
	state().selectStack("business-stack");
	assert.deepEqual(
		stack().bookIds.map((id) => books.find((book) => book.id === id).title),
		["Traction", "Blitzscaling", "Empowered"],
	);
});

test("tilt affects only selected books, remains on the arc, and rests on the shelf", () => {
	const id = idOf("Stilness is the Key");
	const before = placements();
	state().selectBook(id);
	for (const angle of [-45, -10, 0, 25, 45]) {
		state().setAngle(angle);
		const result = placements().find((item) => item.book.id === id);
		closeTo(
			Math.hypot(result.position[0], result.position[2]),
			7.4,
			"Book stays on shelf arc",
		);
		closeTo(
			bounds(result).min.y,
			(result.shelfIndex - 1) * SHELF_SPACING + SHELF_THICKNESS,
			"Book bottom touches shelf",
		);
		for (const other of before.filter(
			(item) => item.shelfIndex !== result.shelfIndex,
		)) {
			assert.deepEqual(
				placements().find((item) => item.book.id === other.book.id),
				other,
				"Other shelves do not rotate",
			);
		}
	}
	state().setAngle(180);
	assert.equal(state().document.items[id].angle, 45);
});

test("orientation buttons can be reused with full-size geometry and atomic undo/redo", () => {
	const id = idOf("Shaolin spirit");
	state().selectBook(id);
	for (const orientation of ["flat", "cover", "spine", "flat", "spine", "cover", "flat"]) {
		const previous = structuredClone(state().document);
		const historyLength = state().past.length;
		state().setBookOrientation(orientation);
		const expected = structuredClone(state().document);
		const item = expected.items[id];
		assert.equal(item.layout, orientation === "flat" ? "flat" : "upright");
		assert.equal(item.face, orientation === "spine" ? "spine" : "cover");
		assert.equal(state().past.length, historyLength + 1);
		const placement = placements().find((entry) => entry.book.id === id);
		assert.equal(placement.scale, 1);
		closeTo(bounds(placement).min.y, 2.08, "Book stays on shelf");
		closeTo(bounds(placement).max.y - bounds(placement).min.y,
			placement.book.dimensions[orientation === "flat" ? 2 : 1], "Full physical height");
		state().setBookOrientation(orientation);
		assert.equal(state().past.length, historyLength + 1, "Repeated active button is a no-op");
		state().undo();
		assert.deepEqual(state().document, previous);
		state().redo();
		assert.deepEqual(state().document, expected);
		assert.deepEqual(state().selectedIds, [id]);
	}
});

test("orientation controls stand a selected stack upright and undo restores it", () => {
	state().selectStack("business-stack");
	const previous = structuredClone(state().document);
	const ids = [...state().selectedIds];
	state().setBookOrientation("flat");
	assert.deepEqual(state().document, previous);
	assert.equal(state().past.length, 0);
	state().setBookOrientation("spine");
	assert.equal(state().activeStackId, null);
	for (const id of ids) {
		assert.equal(state().document.items[id].layout, "upright");
		assert.equal(state().document.items[id].face, "spine");
	}
	validateDocument();
	state().undo();
	assert.deepEqual(state().document, previous);
	assert.equal(state().activeStackId, "business-stack");
});

test("flat books and spine-facing tilted books stay grounded", () => {
	const id = idOf("Shaolin spirit");
	state().selectBook(id);
	for (const face of ["cover", "spine", "back"]) {
		state().setFace(face);
		state().setAngle(30);
		let placement = placements().find((item) => item.book.id === id);
		closeTo(bounds(placement).min.y, 2.08, `${face} tilted bottom`);
		state().setLayout("flat");
		placement = placements().find((item) => item.book.id === id);
		closeTo(bounds(placement).min.y, 2.08, "Flat bottom");
		closeTo(
			bounds(placement).max.y - bounds(placement).min.y,
			placement.book.dimensions[2] * placement.scale,
			"Flat height equals thickness",
		);
	}
});

test("flat books rest cover-up with spines facing out, including flipped and alternating stacks", () => {
	const verify = (placement, facingOut) => {
		const rotation = new Quaternion().setFromEuler(new Euler(...placement.rotation));
		const cover = new Vector3(0, 0, 1).applyQuaternion(rotation);
		closeTo(cover.y, 1, "Front cover points upward");
		const spine = new Vector3(-1, 0, 0).applyQuaternion(rotation);
		const outward = new Vector3(...placement.position).setY(0).normalize().negate();
		closeTo(spine.dot(outward), facingOut ? 1 : -1, "Spine faces the expected side");
	};
	state().selectStack("business-stack");
	for (const flipped of [false, true]) {
		for (const alternate of [false, true]) {
			stack().bookIds.forEach((id, index) => {
				verify(placements().find((item) => item.book.id === id), !(flipped !== (alternate && index % 2 === 1)));
			});
			state().toggleAlternateSpines();
		}
		state().flipStack();
	}
	state().selectBook(idOf("Shaolin spirit"));
	state().setLayout("flat");
	verify(placements().find((item) => item.book.id === idOf("Shaolin spirit")), true);
});

test("stack arrows reorder the actual 3D heights, enforce endpoints, and undo", () => {
	state().selectStack("business-stack");
	const empowered = idOf("Empowered");
	const before = placements().find((item) => item.book.id === empowered)
		.position[1];
	state().moveInStack(empowered, "up");
	assert.equal(state().past.length, 0, "Top boundary is a no-op");
	state().moveInStack(empowered, "down");
	assert.ok(
		placements().find((item) => item.book.id === empowered).position[1] <
			before,
	);
	assert.equal(stack().bookIds.at(-1), idOf("Blitzscaling"));
	state().undo();
	assert.equal(stack().bookIds.at(-1), empowered);
	state().redo();
	assert.equal(stack().bookIds.at(-1), idOf("Blitzscaling"));
	validateDocument();
});

test("stack geometry has no overlapping books and alternate spines changes every other orientation", () => {
	state().selectStack("business-stack");
	const original = placements();
	const stackPlacements = stack().bookIds.map((id) =>
		original.find((item) => item.book.id === id),
	);
	for (let i = 1; i < stackPlacements.length; i++)
		assert.ok(
			bounds(stackPlacements[i]).min.y > bounds(stackPlacements[i - 1]).max.y,
		);
	state().toggleAlternateSpines();
	stack().bookIds.forEach((id, index) => {
		const before = original.find((item) => item.book.id === id);
		const after = placements().find((item) => item.book.id === id);
		assert.deepEqual(after.position, before.position);
		if (index % 2) assert.notDeepEqual(after.rotation, before.rotation);
		else assert.deepEqual(after.rotation, before.rotation);
	});
});

test("add on top moves an existing book once, prevents duplicates, and unstack preserves all books", () => {
	state().selectStack("business-stack");
	const id = idOf("THE SOURCE");
	state().addToStack(id);
	assert.equal(stack().bookIds.at(-1), id);
	state().addToStack(id);
	assert.equal(stack().bookIds.length, 4);
	validateDocument();
	const count = state().document.order.length;
	state().unstack();
	assert.equal(state().document.stacks.length, 0);
	assert.equal(state().document.order.length, count);
	assert.equal(state().activeStackId, null);
	validateDocument();
});

test("creating a stack detaches previous memberships and moving it moves every member", () => {
	state().selectStack("business-stack");
	state().setMultiSelect(true);
	state().selectBook(idOf("THE SOURCE"));
	state().createStack();
	assert.equal(state().document.stacks.length, 1);
	assert.equal(stack().bookIds.length, 4);
	state().moveToShelf(3);
	validateDocument();
	for (const id of stack().bookIds)
		assert.equal(
			placements().find((entry) => entry.book.id === id).shelfIndex,
			3,
		);
});

test("a continuous slider gesture is a single undo step", () => {
	const initial = state().document;
	state().beginInteraction();
	for (let angle = -40; angle <= 40; angle++) state().setAngle(angle);
	state().endInteraction();
	assert.equal(state().past.length, 1);
	state().undo();
	assert.deepEqual(state().document, initial);
	state().redo();
	assert.equal(state().document.items[state().selectedIds[0]].angle, 40);
});

test("direction buttons move whole stacks, respect shelf boundaries, and support undo and redo", () => {
	state().selectStack("business-stack");
	const original = state().document;
	const originalOrder = [...stack().bookIds];
	const row = () => state().document.order.filter((id) => state().document.items[id].shelf === 1);
	state().nudgeSelection("left");
	assert.equal(state().past.length, 0, "Leftmost stack stays in place");
	state().nudgeSelection("right");
	assert.equal(row()[0], idOf("Four Thousand Weeks"));
	assert.deepEqual(stack().bookIds, originalOrder);
	assert.equal(state().past.length, 1);
	const moved = state().document;
	state().undo();
	assert.deepEqual(state().document, original);
	state().redo();
	assert.deepEqual(state().document, moved);
	state().nudgeSelection("left");
	assert.ok(originalOrder.includes(row()[0]));
	state().nudgeSelection("up");
	for (const id of originalOrder) assert.equal(state().document.items[id].shelf, 2);
	state().nudgeSelection("up");
	const history = state().past.length;
	state().nudgeSelection("up");
	assert.equal(state().past.length, history, "Top shelf is a no-op");
	state().nudgeSelection("down");
	for (const id of originalOrder) assert.equal(state().document.items[id].shelf, 2);
	validateDocument();
});

test("grouping keeps books addressable, sorting handles multiple authors, and ungrouping retains books", () => {
	state().selectBooks([
		idOf("Discipline is Destiny"),
		idOf("Stilness is the Key"),
	]);
	state().groupSelection("Evening reading");
	const group = state().document.groups.find(
		(entry) => entry.name === "Evening reading",
	);
	assert.ok(group);
	state().selectGroup(group.id);
	assert.equal(state().selectedIds.length, 2);
	state().ungroup();
	assert.equal(
		state().document.groups.some((entry) => entry.id === group.id),
		false,
	);
	state().groupBy("author", books);
	assert.ok(
		state().document.groups.some(
			(entry) => entry.name === "Ryan Holiday" && entry.bookIds.length === 3,
		),
	);
	validateDocument();
});

test("removing a stack cleans references; undo restores its exact order and selection", () => {
	state().selectStack("business-stack");
	const before = state().document;
	state().removeSelection();
	assert.equal(state().document.order.length, books.length - 3);
	assert.equal(state().document.stacks.length, 0);
	validateDocument();
	state().undo();
	assert.deepEqual(state().document, before);
	assert.equal(state().activeStackId, "business-stack");
	validateDocument();
});

test("spacing changes tangential positions without moving books off the shelf radius", () => {
	const before = placements();
	state().setSpacing(0.3);
	assert.notDeepEqual(
		placements().map((item) => item.position),
		before.map((item) => item.position),
	);
	for (const item of placements())
		closeTo(
			Math.hypot(item.position[0], item.position[2]),
			7.4,
			"Shelf radius",
		);
	state().setSpacing(-1);
	assert.equal(state().document.spacing, 0.03);
});

test("world poses match the parent shelf transform used by the reading transition", () => {
	for (const placement of placements()) {
		const pose = arrangedBookPose(placement);
		closeTo(pose.position[0], placement.position[2], "World X");
		closeTo(pose.position[1], placement.position[1] - 0.8, "World Y");
		closeTo(pose.position[2], -placement.position[0], "World Z");
		closeTo(new Quaternion(...pose.quaternion).length(), 1, "Unit rotation");
	}
});

test("even a tall stack keeps every book at its original size and thickness", () => {
	state().selectBooks(state().document.order);
	state().createStack();
	validateDocument();
	const result = placements();
	const totalBounds = new Box3();
	for (const item of result) totalBounds.union(bounds(item));
	for (const item of result) {
		assert.equal(item.scale, 1);
		closeTo(bounds(item).max.y - bounds(item).min.y, item.book.dimensions[2], "Original thickness");
	}
	closeTo(totalBounds.max.y - totalBounds.min.y, books.reduce((sum, book) => sum + book.dimensions[2], 0) + (books.length - 1) * 0.012, "Full-size stack height");
	const bottom = result.find((entry) => entry.book.id === stack().bookIds[0]);
	closeTo(
		totalBounds.min.y,
		(bottom.shelfIndex - 1) * SHELF_SPACING + SHELF_THICKNESS,
		"Tall stack bottom",
	);
});

test("fanning a crowded shelf preserves physical size and keeps angles in range", () => {
	state().selectBooks(state().document.order);
	state().setLayout("fan");
	for (const item of placements()) {
		assert.ok(Math.abs(state().document.items[item.book.id].angle) <= 30);
		assert.equal(item.scale, 1);
	}
	validateDocument();
});

test("layout, spacing, facing, and shelf changes never shrink any book", () => {
	state().selectBooks(state().document.order);
	state().moveToShelf(0);
	for (const layout of ["upright", "flat", "lean", "fan", "stack", "upright"]) {
		state().setLayout(layout);
		state().setSpacing(0.3);
		for (const face of ["cover", "spine", "back"]) {
			state().setFace(face);
			for (const placement of placements()) assert.equal(placement.scale, 1, `${layout}/${face}: ${placement.book.title}`);
		}
	}
});

test("opening a book editor clears multi-selection and requests a fresh camera focus", () => {
	state().setEditing(false);
	state().selectBooks(state().document.order);
	state().setMultiSelect(true);
	const id = idOf("Shaolin spirit");
	const revision = state().viewRevision;
	const document = state().document;
	state().openBookEditor(id);
	assert.equal(state().editing, true);
	assert.equal(state().multiSelect, false);
	assert.deepEqual(state().selectedIds, [id]);
	assert.equal(state().panel, "arrange");
	assert.equal(state().shelfView, "front");
	assert.ok(state().viewRevision > revision);
	assert.equal(
		state().document,
		document,
		"Opening the editor does not change the arrangement",
	);
});

test("long-press editing a stacked book selects its whole stack without rearranging it", () => {
	state().openBookEditor(idOf("Empowered"));
	assert.equal(state().activeStackId, "business-stack");
	assert.equal(state().panel, "stack");
	assert.equal(state().selectedIds.length, 3);
	validateDocument();
});

test("camera focus is computed from the chosen book's real position and adapts to portrait screens", () => {
	const chosen = placements().filter(
		({ book }) => book.id === idOf("Shaolin spirit"),
	);
	const bounds = arrangedBooksBounds(chosen);
	const desktop = frameShelfSelection(chosen, 1440, 900);
	const mobile = frameShelfSelection(chosen, 320, 844);
	assert.deepEqual(desktop.target, bounds.getCenter(new Vector3()));
	assert.deepEqual(mobile.target, desktop.target);
	assert.ok(mobile.distance >= desktop.distance);
	assert.equal(frameShelfSelection([], 390, 844), null);
	const other = placements().filter(
		({ book }) => book.id === idOf("THE SOURCE"),
	);
	assert.notDeepEqual(
		frameShelfSelection(other, 390, 844).target,
		mobile.target,
	);
});

test('full-circle shelves distribute books across the front and rear without changing book scale', () => {
 const repeated=Array.from({length:8},(_,loop)=>books.map(book=>({...book,id:`loop-${loop}:${book.id}`}))).flat();
 store.setState({initialized:false});store.getState().initialize(repeated);
 const placements=arrangeShelfBooks(repeated,{...store.getState().document,fullCircle:true});
 assert.equal(placements.length,repeated.length);
 assert.ok(placements.every(p=>p.scale===1));
 for(let row=0;row<4;row++){
  const entries=placements.filter(p=>p.shelfIndex===row);
  assert.ok(entries.some(p=>p.position[0]<-5),'books reach the rear');
  assert.ok(entries.some(p=>p.position[0]>5),'books reach the front');
  assert.ok(entries.some(p=>p.position[2]<-5));
  assert.ok(entries.some(p=>p.position[2]>5));
 }
});

test('level 10 expands the former 24 sets tenfold with stable independent identities', async()=>{
 const {loopLibrary}=await import('../src/lib/libraryLoops.ts');
 const expanded=loopLibrary(books,10);
 assert.equal(expanded.length,books.length*240);
 assert.equal(new Set(expanded.map(b=>b.id)).size,expanded.length);
 assert.deepEqual(loopLibrary(expanded,10).map(b=>b.id),expanded.map(b=>b.id));
 assert.deepEqual(loopLibrary(expanded,9),books);
});

test('full shelves preserve original sizes and leave overflow in the catalog', async () => {
 const {loopLibrary}=await import('../src/lib/libraryLoops.ts');
 const expanded=loopLibrary(books,10);
 const document={fullCircle:true,items:Object.fromEntries(expanded.map((book,index)=>[book.id,{shelf:index%4,layout:'upright',angle:0,face:'spine'}])),order:expanded.map(book=>book.id),stacks:[],groups:[],spacing:0.16,alignment:'center'};
 const originalOrder=[...document.order];
 const result=arrangeShelfBooks(expanded,document);
 assert.ok(result.length > 0 && result.length < expanded.length);
 assert.equal(expanded.length,books.length*240);
 assert.deepEqual(document.order,originalOrder);
 assert.ok(result.every(entry => entry.scale === 1));
 for(const entry of result) closeTo(Math.hypot(entry.position[0],entry.position[2]),7.4,'original shelf radius');
 for(let row=0;row<4;row++) {
  const entries=result.filter(entry=>entry.shelfIndex===row).map(entry=>({angle:Math.atan2(entry.position[2],entry.position[0]),width:entry.book.dimensions[2]})).sort((a,b)=>a.angle-b.angle);
  for(let index=0;index<entries.length;index++) {
   const current=entries[index],next=entries[(index+1)%entries.length];
   const angle=(next.angle-current.angle+Math.PI*2)%(Math.PI*2);
   assert.ok(angle*7.4+1e-7 >= (current.width+next.width)/2+document.spacing);
  }
 }
});
