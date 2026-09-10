import { Environment, Lightformer } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Object3D, type SpotLight, type Vector3 } from "three";
import { usePresentationStore } from "../../stores/usePresentationStore";

function MovingSpotlight({ shelves }: { shelves: boolean }) {
	const lightRef = useRef<SpotLight>(null);
	const target = useMemo(() => new Object3D(), []);
	const elapsed = useRef(0);
	const radius = shelves ? 11 : 2.4;

	useFrame((state, delta) => {
		const light = lightRef.current;
		if (!light) return;
		elapsed.current += Math.min(delta, 0.1);
		const angle = elapsed.current * 0.65;
		// Follow the scene's orbit target, including the shelves away from the origin.
		const controls = state.controls as { target?: Vector3 } | null;
		if (controls?.target) target.position.copy(controls.target);
		light.position.set(
			target.position.x + Math.sin(angle) * radius,
			target.position.y + radius * (0.6 + Math.sin(angle * 0.7) * 0.2),
			target.position.z + Math.cos(angle) * radius,
		);
	});

	return (
		<group name="moving-spotlight">
			<primitive object={target} />
			<spotLight
				ref={lightRef}
				target={target}
				color="#fffaf2"
				intensity={radius ** 2 * 6}
				distance={radius * 4}
				decay={2}
				angle={shelves ? 0.85 : 0.6}
				penumbra={0.55}
			/>
		</group>
	);
}

export default function Lightning({ shelves = false }: { shelves?: boolean }) {
	const movingLight = usePresentationStore((state) => state.movingLight);

	return (
		<group name="studio-lighting">
			<ambientLight intensity={0.3} />
			<hemisphereLight args={["#eef3ff", "#34303b", 0.7]} />
			<group name="soft-lighting">
				<directionalLight
					position={[-3, 5, 4]}
					color="#fff0df"
					intensity={1.8}
				/>
				<directionalLight
					position={[4, 2, 2]}
					color="#dde9ff"
					intensity={0.8}
				/>
				<directionalLight
					position={[1, 3, -5]}
					color="#f1edff"
					intensity={1.4}
				/>
			</group>
			{movingLight && <MovingSpotlight shelves={shelves} />}
			<Environment resolution={128} frames={1}>
				<Lightformer
					form="rect"
					position={[-3, 3, 2]}
					target={[0, 0, 0]}
					scale={[4, 5, 1]}
					color="#fff1dd"
					intensity={1.5}
				/>
				<Lightformer
					form="rect"
					position={[4, 1, 1]}
					target={[0, 0, 0]}
					scale={[2, 5, 1]}
					color="#e3edff"
					intensity={1}
				/>
				<Lightformer
					form="rect"
					position={[0, 2, -5]}
					target={[0, 0, 0]}
					scale={[5, 3, 1]}
					color="#f3efff"
					intensity={1.5}
				/>
			</Environment>
		</group>
	);
}
