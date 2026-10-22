import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, type Group, type InstancedMesh, Object3D } from "three";
import { geoToScene, type LngLat, type Vec3 } from "../core/geo.ts";
import { tornadoLayout } from "../core/tornadoShape.ts";
import type { MapPlayRuntime } from "../runtime/mapRuntime.ts";
import { registerProbe, sampleSpeed, testHooksEnabled } from "./testProbe";

const BOOK_COUNT = 72;
const HEIGHT = 34;
const RADIUS = 9;
const SPIN = 0.9; // rad/s, visual only
const COLORS = ["#d91b24", "#7c1414", "#f3ead8", "#cfaaa2", "#3d3030"];

/**
 * Render-only view of the simulated player. Reads the runtime each frame (no React state, no
 * Zustand) and converts position through the single geo helper. One InstancedMesh = one draw call;
 * no textures, so it works offline.
 */
export function TornadoPlayer({
	runtime,
	origin,
}: {
	runtime: MapPlayRuntime;
	origin: LngLat;
}) {
	const root = useRef<Group>(null);
	const spin = useRef<Group>(null);
	const mesh = useRef<InstancedMesh>(null);
	const layout = useMemo(() => tornadoLayout(BOOK_COUNT, HEIGHT, RADIUS), []);
	// Per-frame scratch, allocated once per mount.
	const scratch = useMemo(
		() => ({ at: { lng: 0, lat: 0 } as LngLat, pos: [0, 0, 0] as Vec3 }),
		[],
	);

	useLayoutEffect(() => {
		const m = mesh.current;
		if (!m) return;
		const dummy = new Object3D();
		const color = new Color();
		layout.forEach((b, i) => {
			dummy.position.set(b.x, b.y, b.z);
			dummy.rotation.set(0, b.rotY, b.rotZ);
			dummy.scale.setScalar(b.scale);
			dummy.updateMatrix();
			m.setMatrixAt(i, dummy.matrix);
			m.setColorAt(i, color.set(COLORS[i % COLORS.length]));
		});
		m.instanceMatrix.needsUpdate = true;
		if (m.instanceColor) m.instanceColor.needsUpdate = true;
	}, [layout]);

	const camera = useThree((s) => s.camera);
	useEffect(() => {
		if (testHooksEnabled && root.current)
			registerProbe({ runtime, entity: root.current, camera });
	}, [runtime, camera]);

	useFrame((_, delta) => {
		const g = root.current;
		if (!g) return;
		runtime.renderPosition(scratch.at);
		geoToScene(scratch.at, origin, scratch.pos);
		g.position.set(scratch.pos[0], scratch.pos[1], scratch.pos[2]);
		if (spin.current && !runtime.loop.paused)
			spin.current.rotation.y -= Math.min(delta, 0.1) * SPIN;
		if (testHooksEnabled) sampleSpeed();
	});

	return (
		<group ref={root} name="tornado-player">
			<group ref={spin}>
				<instancedMesh
					ref={mesh}
					args={[undefined, undefined, BOOK_COUNT]}
					frustumCulled={false}
				>
					<boxGeometry args={[1.6, 2.4, 0.32]} />
					<meshStandardMaterial roughness={0.7} />
				</instancedMesh>
			</group>
			<mesh rotation-x={-Math.PI / 2} position-y={0.05}>
				<circleGeometry args={[RADIUS * 1.1, 40]} />
				<meshBasicMaterial color="#d91b24" transparent opacity={0.18} />
			</mesh>
		</group>
	);
}

/** Static landmark at a fixed coordinate. Used to verify map/entity alignment visually and in tests. */
export function HomeMarker({ at, origin }: { at: LngLat; origin: LngLat }) {
	const pos = useMemo(() => geoToScene(at, origin, [0, 0, 0]), [at, origin]);
	return (
		<group position={pos} name="home-marker">
			<mesh position-y={6}>
				<cylinderGeometry args={[0.6, 0.6, 12, 12]} />
				<meshStandardMaterial color="#151a2e" />
			</mesh>
			<mesh position-y={13}>
				<sphereGeometry args={[2, 16, 12]} />
				<meshStandardMaterial color="#d91b24" />
			</mesh>
		</group>
	);
}
