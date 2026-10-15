import { type BufferGeometry, PlaneGeometry } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { TessellateModifier } from "three/addons/modifiers/TessellateModifier.js";
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

export function createShelfPlateGeometry(width: number) {
	const rounded = new RoundedBoxGeometry(
		width,
		0.078,
		0.02,
		8,
		0.006,
	).translate(0, 0, 0.013);
	// RoundedBox has large flat center triangles. Subdivide BEFORE bending so
	// its face follows the arc instead of cutting across the lettering layer.
	const body = new TessellateModifier(0.04, 10).modify(rounded);
	rounded.dispose();
	return {
		body: curvePlate(body),
		face: curvePlate(
			new PlaneGeometry(width - 0.012, 0.066, 64, 1).translate(0, 0, 0.025),
		),
	};
}
