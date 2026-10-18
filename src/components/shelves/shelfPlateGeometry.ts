import { BoxGeometry, type BufferGeometry, PlaneGeometry } from "three";
import { SHELF_INNER_RADIUS } from "./shelfBooks.ts";

// Bend both the metal and lettering around the shelf's inner radius.
function curvePlate(geometry: BufferGeometry) {
	const positions = geometry.getAttribute("position");
	for (let i = 0; i < positions.count; i++) {
		const angle = positions.getX(i) / SHELF_INNER_RADIUS;
		const radius = SHELF_INNER_RADIUS - positions.getZ(i);
		positions.setXYZ(
			i,
			radius * Math.sin(angle),
			positions.getY(i),
			SHELF_INNER_RADIUS - radius * Math.cos(angle),
		);
	}
	positions.needsUpdate = true;
	geometry.computeVertexNormals();
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
	return geometry;
}

/**
 * A plate only bends along its length, so the box is subdivided along X
 * (one segment per ~0.02 units) and left coarse elsewhere. The previous
 * RoundedBox + TessellateModifier version produced ~37k triangles per plate;
 * this stays under 1k with the same silhouette on screen.
 */
export function createShelfPlateGeometry(width: number) {
	const lengthSegments = Math.max(16, Math.ceil(width / 0.02));
	const body = new BoxGeometry(
		width,
		0.078,
		0.02,
		lengthSegments,
		2,
		1,
	).translate(0, 0, 0.013);
	return {
		body: curvePlate(body),
		face: curvePlate(
			new PlaneGeometry(width - 0.012, 0.066, lengthSegments, 1).translate(
				0,
				0,
				0.025,
			),
		),
	};
}
