import {
	type Camera,
	MathUtils,
	Plane,
	Raycaster,
	Vector2,
	Vector3,
} from "three";
import { arrangedBookPose, type ArrangedBook } from "./shelfArrangement.ts";
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

/** Freeze the projection at pickup so camera follow cannot feed back into dragging. */
export function createShelfDragProjector(
	camera: Camera,
	rect: { left: number; top: number; width: number; height: number },
	anchor: Vector3,
	pointer: { clientX: number; clientY: number },
) {
	const dragCamera = camera.clone();
	dragCamera.updateMatrixWorld();
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
		raycaster.setFromCamera(cursor, dragCamera);
		return raycaster.ray.intersectPlane(plane, new Vector3());
	};
	const origin = project(pointer);
	return (next: { clientX: number; clientY: number }) => {
		const point = project(next);
		return point && origin ? point.sub(origin) : null;
	};
}
