import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { geoToScene, type LngLat, type Vec3 } from "../core/geo.ts";
import type { TornadoInstance } from "../core/tornadoBooks.ts";
import type { MapPlayRuntime } from "../runtime/mapRuntime.ts";
import { TornadoBooks } from "./TornadoBooks";
import { registerProbe, sampleSpeed, testHooksEnabled } from "./testProbe";
import type { CoverSheet } from "./tornadoCovers";

const RADIUS = 9;
const SPIN = 0.9; // rad/s, visual only

/**
 * Render-only view of the simulated player. Reads the runtime each frame (no React state, no
 * Zustand) and converts position through the single geo helper. The books come in as props,
 * loaded outside the frame loop; an empty library shows just the tornado's ground ring.
 */
export function TornadoPlayer({
	runtime,
	origin,
	books,
	sheet,
}: {
	runtime: MapPlayRuntime;
	origin: LngLat;
	books: TornadoInstance[];
	sheet?: CoverSheet;
}) {
	const root = useRef<Group>(null);
	const spin = useRef<Group>(null);
	// Per-frame scratch, allocated once per mount.
	const scratch = useMemo(
		() => ({ at: { lng: 0, lat: 0 } as LngLat, pos: [0, 0, 0] as Vec3 }),
		[],
	);

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
				<TornadoBooks instances={books} sheet={sheet} />
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
