import assert from "node:assert/strict";
import { test } from "node:test";
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { createShelfPlateGeometry } from "../src/components/shelves/shelfPlateGeometry.ts";

test("lettering remains in front of the curved gold backing across all plate widths", () => {
	for (const width of [0.68, 1.1, 1.6]) {
		const geometry = createShelfPlateGeometry(width);
		const material = new MeshBasicMaterial();
		const body = new Mesh(geometry.body, material);
		const face = new Mesh(geometry.face, material);
		for (let step = -9; step <= 9; step++) {
			const x = step / 10 * (width / 2 - 0.012);
			const ray = new Raycaster(new Vector3(x, 0, 1), new Vector3(0, 0, -1));
			const metalHit = ray.intersectObject(body)[0];
			const textHit = ray.intersectObject(face)[0];
			assert.ok(metalHit && textHit);
			assert.ok(textHit.distance < metalHit.distance, `Text occluded at width ${width}, x ${x}`);
		}
		geometry.body.dispose(); geometry.face.dispose(); material.dispose();
	}
});
