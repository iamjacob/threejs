import { Box3, Matrix4, Euler, Quaternion, Vector3 } from "three";
import type { ShelfDocument, ShelfZoom } from "../../lib/shelfModel";
import {
	SHELF_INNER_RADIUS,
	SHELF_SPACING,
	SHELF_THICKNESS,
	type ShelfBook,
} from "./shelfBooks.ts";

export type ArrangedBook = {
	book: ShelfBook;
	shelfIndex: number;
	position: [number, number, number];
	rotation: [number, number, number];
	scale: number;
	stackId?: string;
};

export const SHELF_RADIUS = SHELF_INNER_RADIUS + 0.4;
/** Arc fraction of the smallest (level 4) shelf; see progressionConfig. */
export const BASE_SHELF_FRACTION = 0.08;

type ShelfUnit = { ids: string[]; stackId?: string; width: number };

/** Group books into per-shelf units (single books or whole stacks) with their footprint. */
function shelfRows(books: ShelfBook[], document: ShelfDocument): ShelfUnit[][] {
	const catalog = new Map(books.map((book) => [book.id, book]));
	const seen = new Set<string>();
	const rows: ShelfUnit[][] = [[], [], [], []];
	const widthOf = (id: string) => {
		const book = catalog.get(id)!;
		const item = document.items[id];
		if (item.layout === "flat") return book.dimensions[1];
		const width = book.dimensions[item.face === "spine" ? 2 : 0];
		const tilt = (item.angle * Math.PI) / 180;
		return (
			Math.abs(width * Math.cos(tilt)) +
			Math.abs(book.dimensions[1] * Math.sin(tilt))
		);
	};
	for (const id of document.order) {
		if (seen.has(id) || !catalog.has(id) || !document.items[id]) continue;
		const stack = document.stacks.find((entry) => entry.bookIds.includes(id));
		const ids = (stack?.bookIds ?? [id]).filter(
			(bookId) => catalog.has(bookId) && document.items[bookId],
		);
		for (const bookId of ids) seen.add(bookId);
		const width = stack
			? Math.max(...ids.map((bookId) => catalog.get(bookId)!.dimensions[1]))
			: widthOf(id);
		rows[document.items[id].shelf].push({ ids, stackId: stack?.id, width });
	}
	return rows;
}

/** Width of each shelf row including spacing between units. */
export function shelfRowWidths(books: ShelfBook[], document: ShelfDocument) {
	return shelfRows(books, document).map(
		(row) =>
			row.reduce((sum, unit) => sum + unit.width, 0) +
			Math.max(0, row.length - 1) * document.spacing,
	);
}

/**
 * Shelves grow with the library: the arc is whatever the widest row needs
 * (plus `extraWidth`, e.g. a picture frame, and a margin at each end), never
 * smaller than the level's own arc and never more than the full circle.
 */
export function shelfArcFraction(
	books: ShelfBook[],
	document: ShelfDocument,
	levelFraction = BASE_SHELF_FRACTION,
	extraWidth = 0,
) {
	if (document.fullCircle || levelFraction >= 1) return 1;
	const widest = Math.max(0, ...shelfRowWidths(books, document));
	const needed =
		(widest + extraWidth + document.spacing * 2) / (SHELF_RADIUS * Math.PI * 2);
	return Math.min(1, Math.max(levelFraction, needed));
}

/** Usable cursor range of a row along the arc, matching `arrangeShelfBooks` alignment. */
function rowSpan(
	rowWidth: number,
	document: ShelfDocument,
	arcFraction: number,
) {
	const capacity = SHELF_RADIUS * Math.PI * 2 * arcFraction - 0.16;
	const availableWidth = Math.max(capacity, rowWidth);
	const start =
		document.alignment === "left"
			? -availableWidth / 2
			: document.alignment === "right"
				? availableWidth / 2 - rowWidth
				: -rowWidth / 2;
	return { start, end: start + rowWidth, capacity };
}

/**
 * Where a front-facing picture frame stands: on the emptiest shelf, just past
 * the last book of that row, like one more upright cover.
 */
export function pictureFrameSlot(
	books: ShelfBook[],
	document: ShelfDocument,
	arcFraction: number,
	frameWidth: number,
) {
	const widths = shelfRowWidths(books, document);
	const shelf = widths.indexOf(Math.min(...widths));
	const { end } = rowSpan(widths[shelf], document, arcFraction);
	const gap = widths[shelf] > 0 ? document.spacing : 0;
	return { shelf, angle: -(end + gap + frameWidth / 2) / SHELF_RADIUS };
}

/** Pose on the arc for something standing upright on a shelf and facing outward. */
export function shelfSlotPose(shelf: number, angle: number, height: number) {
	return {
		position: [
			Math.cos(angle) * SHELF_RADIUS,
			(shelf - 1) * SHELF_SPACING + SHELF_THICKNESS + height / 2,
			-Math.sin(angle) * SHELF_RADIUS,
		] as [number, number, number],
		rotation: [0, angle - Math.PI / 2, 0] as [number, number, number],
	};
}

/** Lay out on the shelf's arc, preserving contact with the shelf at every angle. */
export function arrangeShelfBooks(
	books: ShelfBook[],
	document: ShelfDocument,
	arcFraction = document.fullCircle ? 1 : BASE_SHELF_FRACTION,
): ArrangedBook[] {
	const catalog = new Map(books.map((book) => [book.id, book]));
	const rows = shelfRows(books, document);
	const radius = SHELF_RADIUS;
	const capacity =
		radius * Math.PI * 2 * (document.fullCircle ? 1 : arcFraction) - 0.16;
	return rows.flatMap((allUnits, shelfIndex) => {
		// Only display complete units that fit; overflow stays in the library catalog.
		let occupied = 0;
		const row = document.fullCircle
			? allUnits.filter((unit) => {
					const required = unit.width + document.spacing;
					if (occupied + required > capacity) return false;
					occupied += required;
					return true;
				})
			: allUnits;
		const rowWidth = row.reduce((sum, unit) => sum + unit.width, 0);
		const spacing =
			document.fullCircle && row.length > 1
				? Math.max(document.spacing, (capacity - rowWidth) / row.length)
				: document.spacing;
		const fullWidth =
			row.reduce((sum, unit) => sum + unit.width, 0) +
			Math.max(0, row.length - 1) * spacing;
		// Arrangement never changes a book's physical dimensions.
		const width = fullWidth;
		const availableWidth = Math.max(capacity, width);
		let cursor =
			document.alignment === "left"
				? -availableWidth / 2
				: document.alignment === "right"
					? availableWidth / 2 - width
					: -width / 2;
		return row.flatMap((unit) => {
			const center = cursor + unit.width / 2;
			cursor += unit.width + spacing;
			const angle = -center / radius;
			const base = new Quaternion().setFromEuler(
				new Euler(0, angle - Math.PI / 2, 0),
			);
			const stack = document.stacks.find((entry) => entry.id === unit.stackId);
			let elevation = 0;
			return unit.ids.map((id, index) => {
				const book = catalog.get(id)!;
				const item = document.items[id];
				const [w, h, d] = book.dimensions;
				const flat = Boolean(stack) || item.layout === "flat";
				const tilt = (item.angle * Math.PI) / 180;
				const height = flat
					? d
					: Math.abs(h * Math.cos(tilt)) +
						Math.abs((item.face === "spine" ? d : w) * Math.sin(tilt));
				const alternate = stack
					? stack.flipped !== (stack.alternateSpines && index % 2 === 1)
					: item.face === "back";
				const local = flat
					? new Quaternion()
							.setFromEuler(
								new Euler(0, Math.PI / 2 + (alternate ? Math.PI : 0), 0),
							)
							.multiply(
								// Lay the front cover upward so spine lettering reads upright.
								new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0)),
							)
					: new Quaternion()
							.setFromEuler(new Euler(0, 0, -tilt))
							.multiply(
								new Quaternion().setFromEuler(
									new Euler(
										0,
										item.face === "spine"
											? Math.PI / 2
											: item.face === "back"
												? Math.PI
												: 0,
										0,
									),
								),
							);
				const rotation = new Euler().setFromQuaternion(
					base.clone().multiply(local),
				);
				const y =
					(shelfIndex - 1) * SHELF_SPACING +
					SHELF_THICKNESS +
					(elevation + height / 2);
				if (stack) elevation += height + 0.012;
				return {
					book,
					shelfIndex,
					stackId: stack?.id,
					scale: 1,
					position: [
						Math.cos(angle) * radius,
						y,
						-Math.sin(angle) * radius,
					] as [number, number, number],
					rotation: [rotation.x, rotation.y, rotation.z] as [
						number,
						number,
						number,
					],
				};
			});
		});
	});
}

export function arrangedBookPose(placement: ArrangedBook) {
	const parent = new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0));
	return {
		position: new Vector3(...placement.position)
			.applyQuaternion(parent)
			.add(new Vector3(0, -0.8, 0))
			.toArray(),
		quaternion: parent
			.multiply(new Quaternion().setFromEuler(new Euler(...placement.rotation)))
			.toArray(),
	};
}

export function arrangedBooksBounds(placements: ArrangedBook[]) {
	const bounds = new Box3();
	for (const placement of placements) {
		const pose = arrangedBookPose(placement);
		const [w, h, d] = placement.book.dimensions;
		const box = new Box3(
			new Vector3(-w / 2, -h / 2, -d / 2),
			new Vector3(w / 2, h / 2, d / 2),
		);
		box.applyMatrix4(
			new Matrix4().compose(
				new Vector3(...pose.position),
				new Quaternion(...pose.quaternion),
				new Vector3().setScalar(placement.scale),
			),
		);
		bounds.union(box);
	}
	return bounds;
}

/** Frame the real arranged bounds, including rotated books and complete stacks. */
export function frameShelfSelection(
	placements: ArrangedBook[],
	width: number,
	height: number,
) {
	if (!placements.length) return null;
	const bounds = arrangedBooksBounds(placements);
	const extent = bounds.getSize(new Vector3());
	const aspect = Math.max(0.25, width / Math.max(1, height));
	const tanHalfFov = Math.tan(Math.PI / 8);
	return {
		target: bounds.getCenter(new Vector3()),
		distance:
			Math.max(
				2.6,
				extent.y / (2 * tanHalfFov * 0.38),
				extent.x / (2 * tanHalfFov * aspect * 0.62),
			) +
			extent.z / 2,
	};
}

/** Three one-tap framing levels, using the actual books rather than fixed zoom factors. */
export function frameShelfEditor(
	placements: ArrangedBook[],
	selectedIds: string[],
	zoom: ShelfZoom,
	width: number,
	height: number,
	dragShelf?: number,
) {
	const selected = placements.filter((entry) =>
		selectedIds.includes(entry.book.id),
	);
	if (zoom === "book" && selected.length)
		return frameShelfSelection(selected, width, height);
	const rows = new Set(
		dragShelf === undefined
			? selected.map((entry) => entry.shelfIndex)
			: [dragShelf],
	);
	const visible =
		zoom === "shelf" && rows.size
			? placements.filter((entry) => rows.has(entry.shelfIndex))
			: placements;
	if (!visible.length) return frameShelfSelection(selected, width, height);
	const bounds = arrangedBooksBounds(visible);
	const extent = bounds.getSize(new Vector3());
	const aspect = Math.max(0.25, width / Math.max(1, height));
	const tanHalfFov = Math.tan(Math.PI / 8);
	return {
		target: bounds.getCenter(new Vector3()),
		distance:
			Math.max(
				3.4,
				extent.x / (2 * tanHalfFov * aspect * 0.84),
				extent.y / (2 * tanHalfFov * 0.56),
			) +
			extent.z / 2,
	};
}
