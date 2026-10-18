import { useFBO } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
	BoxGeometry,
	Euler,
	type InstancedMesh,
	Matrix4,
	NearestFilter,
	Quaternion,
	Vector3,
} from "three";
import { SceneGlassMaterial } from "../blur/SceneGlassMaterial";
import type { layoutShelfBooks } from "./shelfBooks";

/** Screen pixels per pixelated block; the capture only needs this much detail. */
const BLOCK_SIZE = 12;
// Half resolution keeps the 12 px blocks identical to the original effect
// while cutting the capture's fragment work to a quarter.
const CAPTURE_SCALE = 0.5;
const unitBox = new BoxGeometry(1, 1, 1);

/**
 * Same pixelated-glass look as CollectionBlur, but the scene capture renders
 * at quarter resolution and only when the camera or viewport changed, and all
 * glass boxes share one instanced draw.
 */
export default function InstancedCollectionBlur({
	placements,
}: {
	placements: ReturnType<typeof layoutShelfBooks>;
}) {
	const mesh = useRef<InstancedMesh>(null);
	const size = useThree((state) => state.size);
	const dpr = useThree((state) => state.viewport.dpr);
	const renderTarget = useFBO(
		Math.max(1, Math.round(size.width * dpr * CAPTURE_SCALE)),
		Math.max(1, Math.round(size.height * dpr * CAPTURE_SCALE)),
		{
			depthBuffer: true,
			stencilBuffer: false,
			minFilter: NearestFilter,
			magFilter: NearestFilter,
			generateMipmaps: false,
		},
	);
	const material = useMemo(() => {
		const glass = new SceneGlassMaterial();
		// The shared glass shader positions a single mesh; instances need their matrix.
		glass.vertexShader = /* glsl */ `
			varying vec4 vUv;
			void main() {
				vec4 worldPosition = vec4(position, 1.0);
				#ifdef USE_INSTANCING
					worldPosition = instanceMatrix * worldPosition;
				#endif
				vUv = projectionMatrix * modelViewMatrix * worldPosition;
				gl_Position = vUv;
			}
		`;
		glass.transparent = true;
		glass.depthWrite = false;
		glass.uBlockSize = BLOCK_SIZE;
		glass.uColorLevels = 12;
		return glass;
	}, []);
	useEffect(() => () => material.dispose(), [material]);
	useLayoutEffect(() => {
		const instanced = mesh.current;
		if (!instanced) return;
		const matrix = new Matrix4();
		const position = new Vector3();
		const quaternion = new Quaternion();
		const scale = new Vector3();
		placements.forEach(({ book, position: p, rotation }, index) => {
			position.set(...p);
			quaternion.setFromEuler(new Euler(...rotation));
			scale.set(
				book.dimensions[0] + 0.05,
				book.dimensions[1] + 0.05,
				book.dimensions[2] + 0.05,
			);
			instanced.setMatrixAt(index, matrix.compose(position, quaternion, scale));
		});
		instanced.count = placements.length;
		instanced.instanceMatrix.needsUpdate = true;
		instanced.computeBoundingSphere();
	}, [placements]);
	const last = useRef({
		view: new Matrix4(),
		projection: new Matrix4(),
		dirty: true,
	});
	// Re-capture when geometry changes too, since the covers behind the glass moved.
	// biome-ignore lint/correctness/useExhaustiveDependencies: placements is the trigger, not a read dependency.
	useEffect(() => {
		last.current.dirty = true;
	}, [placements]);
	useFrame((state) => {
		const instanced = mesh.current;
		if (!instanced) return;
		const { camera, gl, scene } = state;
		const snapshot = last.current;
		const moved =
			snapshot.dirty ||
			!snapshot.view.equals(camera.matrixWorldInverse) ||
			!snapshot.projection.equals(camera.projectionMatrix);
		if (moved) {
			snapshot.view.copy(camera.matrixWorldInverse);
			snapshot.projection.copy(camera.projectionMatrix);
			snapshot.dirty = false;
			const previousTarget = gl.getRenderTarget();
			instanced.visible = false;
			try {
				gl.setRenderTarget(renderTarget);
				gl.render(scene, camera);
			} finally {
				gl.setRenderTarget(previousTarget);
				instanced.visible = true;
			}
		}
		material.uSceneDiffuse = renderTarget.texture;
		material.uWinResolution.set(size.width, size.height);
	});
	return (
		<instancedMesh
			ref={mesh}
			name="shelf-glass-filters"
			args={[unitBox, material, Math.max(1, placements.length)]}
			raycast={() => null}
			frustumCulled={false}
		/>
	);
}
