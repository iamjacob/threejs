import {
	type Camera,
	MathUtils,
	Plane,
	Raycaster,
	Vector2,
	Vector3,
} from "three";
import {
	arrangedBookPose,
	arrangedBooksBounds,
	type ArrangedBook,
} from "./shelfArrangement.ts";
import { SHELF_SPACING, SHELF_THICKNESS } from "./shelfBooks.ts";
import type { ShelfDrop } from "../../lib/shelfDrag";

export const shelfFloorY = (shelf: number) =>
	(shelf - 1) * SHELF_SPACING + SHELF_THICKNESS - 0.8;

export function shelfDropForPoint(
	placements: ArrangedBook[],
	ids: string[],
	x: number,
	bottomY: number,
): ShelfDrop {
	const shelf = MathUtils.clamp(
		Math.round((bottomY - shelfFloorY(0)) / SHELF_SPACING),
		0,
		3,
	);
	const neighbors = placements.filter(
		(entry) => entry.shelfIndex === shelf && !ids.includes(entry.book.id),
	);
	const before = neighbors.find(
		(entry) => arrangedBookPose(entry).position[0] > x,
	);
	return { shelf, beforeId: before?.book.id ?? null };
}

/** Use the visible book faces, including a small area above them, as stack targets. */
export function createShelfStackTargeter(
	camera: Camera,
	rect: { left: number; top: number; width: number; height: number },
	placements: ArrangedBook[],
	ids: string[],
) {
	const frozenCamera = camera.clone();
	frozenCamera.updateMatrixWorld();
	const seen = new Set<string>();
	const targets = placements
		.flatMap((entry) => {
			if (ids.includes(entry.book.id) || seen.has(entry.book.id)) return [];
			const unit = entry.stackId
				? placements.filter((book) => book.stackId === entry.stackId)
				: [entry];
			unit.forEach((book) => seen.add(book.book.id));
			if (unit.some((book) => ids.includes(book.book.id))) return [];
			const box = arrangedBooksBounds(unit);
			const center = box.getCenter(new Vector3());
			if (center.clone().applyMatrix4(frozenCamera.matrixWorldInverse).z >= 0)
				return [];
			const corners = [box.min.x, box.max.x].flatMap((x) =>
				[box.min.y, box.max.y].flatMap((y) =>
					[box.min.z, box.max.z].map((z) =>
						new Vector3(x, y, z).project(frozenCamera),
					),
				),
			);
			const xs = corners.map(
				(point) => rect.left + ((point.x + 1) / 2) * rect.width,
			);
			const ys = corners.map(
				(point) => rect.top + ((1 - point.y) / 2) * rect.height,
			);
			const left = Math.min(...xs),
				right = Math.max(...xs);
			const top = Math.min(...ys),
				bottom = Math.max(...ys);
			const inset = Math.min(20, (right - left) * 0.15);
			return [
				{
					left: left + inset,
					right: right - inset,
					top: top - 24,
					bottom: bottom + 8,
					depth: center.project(frozenCamera).z,
					drop: {
						shelf: entry.shelfIndex,
						beforeId: null,
						stackOnId: entry.book.id,
					} satisfies ShelfDrop,
				},
			];
		})
		.sort((a, b) => a.depth - b.depth);
	return ({
		clientX,
		clientY,
	}: {
		clientX: number;
		clientY: number;
	}): ShelfDrop | null =>
		targets.find(
			(target) =>
				clientX >= target.left &&
				clientX <= target.right &&
				clientY >= target.top &&
				clientY <= target.bottom,
		)?.drop ?? null;
}

/** Project pointer movement through the current view, without camera motion moving the book. */
export function createShelfDragProjector(
	camera: Camera,
	rect: { left: number; top: number; width: number; height: number },
	anchor: Vector3,
	pointer: { clientX: number; clientY: number },
) {
	let previous = { clientX: pointer.clientX, clientY: pointer.clientY };
	const offset = new Vector3();
	const plane = new Plane(new Vector3(0, 0, 1), -anchor.z);
	const raycaster = new Raycaster();
	const cursor = new Vector2();
	const project = ({
		clientX,
		clientY,
	}: {
		clientX: number;
		clientY: number;
	}) => {
		cursor.set(
			((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
			-((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
		);
		raycaster.setFromCamera(cursor, camera);
		return raycaster.ray.intersectPlane(plane, new Vector3());
	};
	return (next: { clientX: number; clientY: number }) => {
		camera.updateMatrixWorld();
		const origin = project(previous);
		const point = project(next);
		previous = { clientX: next.clientX, clientY: next.clientY };
		return point && origin ? offset.add(point.sub(origin)).clone() : null;
	};
}
