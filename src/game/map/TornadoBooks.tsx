import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
	BoxGeometry,
	CanvasTexture,
	Color,
	InstancedBufferAttribute,
	type InstancedMesh,
	MeshStandardMaterial,
	Object3D,
	SRGBColorSpace,
} from "three";
import type { TornadoInstance } from "../core/tornadoBooks.ts";
import type { CoverSheet } from "./tornadoCovers";

/**
 * All library books in ONE InstancedMesh (one draw call). Like the shelf `InstancedBooks`, each
 * instance carries a UV rect (`aCoverRect`) into one shared texture; the front and back faces sample
 * it, other faces use the instance color. Matrices, rects and the texture are built when the
 * library changes, never per frame.
 */
const unitBox = new BoxGeometry(1, 1, 1);

function createMaterial() {
	const material = new MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
	material.customProgramCacheKey = () => "tornado-cover-sheet-v1";
	material.onBeforeCompile = (shader) => {
		shader.vertexShader = shader.vertexShader
			.replace(
				"#include <common>",
				`#include <common>
				attribute vec4 aCoverRect;
				varying float vCoverFace;`,
			)
			.replace(
				"#include <uv_vertex>",
				`#include <uv_vertex>
				#ifdef USE_MAP
				vCoverFace = abs(normal.z) > 0.5 ? 1.0 : 0.0;
				vMapUv = aCoverRect.xy + uv * aCoverRect.zw;
				#endif`,
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				"#include <common>",
				"#include <common>\nvarying float vCoverFace;",
			)
			.replace(
				"#include <map_fragment>",
				`#ifdef USE_MAP
				if (vCoverFace > 0.5) {
					vec4 sampledDiffuseColor = texture2D(map, vMapUv);
					diffuseColor *= sampledDiffuseColor;
				}
				#endif`,
			)
			// Instance color tints only the sides/edges; cover faces show the cover untinted.
			.replace(
				"#include <color_fragment>",
				// three 0.185 color_fragment: `diffuseColor *= vColor` (vColor is vec4).
				`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
				#ifdef USE_MAP
				if (vCoverFace < 0.5) diffuseColor *= vColor;
				#else
				diffuseColor *= vColor;
				#endif
				#endif`,
			);
	};
	return material;
}

export function TornadoBooks({
	instances,
	sheet,
}: {
	instances: TornadoInstance[];
	sheet?: CoverSheet;
}) {
	const mesh = useRef<InstancedMesh>(null);
	const material = useMemo(createMaterial, []);
	useEffect(() => () => material.dispose(), [material]);

	const texture = useMemo(() => {
		if (!sheet) return undefined;
		const t = new CanvasTexture(sheet.canvas);
		t.colorSpace = SRGBColorSpace;
		t.anisotropy = 4;
		return t;
	}, [sheet]);
	useEffect(() => () => texture?.dispose(), [texture]);

	const geometry = useMemo(() => {
		const g = unitBox.clone();
		const rects = new Float32Array(Math.max(1, instances.length) * 4);
		instances.forEach((_, i) => {
			rects.set(sheet?.rects[i] ?? [0, 0, 0, 0], i * 4);
		});
		g.setAttribute("aCoverRect", new InstancedBufferAttribute(rects, 4));
		return g;
	}, [instances, sheet]);
	useEffect(() => () => geometry.dispose(), [geometry]);

	useLayoutEffect(() => {
		material.map = texture ?? null;
		material.needsUpdate = true;
	}, [material, texture]);

	// Swap geometry in place (cover rects change when the sheet arrives) so the mesh and its
	// instance matrices survive; passing it via `args` would recreate the mesh with zero matrices.
	useLayoutEffect(() => {
		if (mesh.current) mesh.current.geometry = geometry;
	}, [geometry]);

	useLayoutEffect(() => {
		const m = mesh.current;
		if (!m) return;
		const dummy = new Object3D();
		const color = new Color();
		instances.forEach((b, i) => {
			dummy.position.set(b.x, b.y, b.z);
			dummy.rotation.set(0, b.rotY, b.rotZ);
			dummy.scale.set(
				b.size[0] * b.scale,
				b.size[1] * b.scale,
				b.size[2] * b.scale,
			);
			dummy.updateMatrix();
			m.setMatrixAt(i, dummy.matrix);
			// With a real cover the front/back sample the texture; the sides keep the book color.
			m.setColorAt(i, color.set(b.color));
		});
		m.count = instances.length;
		m.instanceMatrix.needsUpdate = true;
		if (m.instanceColor) m.instanceColor.needsUpdate = true;
	}, [instances]);

	const count = instances.length;
	if (!count) return null;
	return (
		<instancedMesh
			// Re-created only when the count changes, so the instance buffer always fits the library.
			key={count}
			ref={mesh}
			name="tornado-books"
			args={[unitBox, material, count]}
			frustumCulled={false}
			userData={{ bookIds: instances.map((i) => i.bookId) }}
		/>
	);
}
