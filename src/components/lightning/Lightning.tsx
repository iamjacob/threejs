import { Environment, Lightformer } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Object3D, type SpotLight, type Vector3 } from "three";

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
	return (
		<group name="studio-lighting">
			<ambientLight intensity={0.3} />
			<hemisphereLight args={["#eef3ff", "#34303b", 0.7]} />
			<group name="soft-lighting">
				{/* Light the covers from above/front-left; shadows fall back and sideways. */}
				<directionalLight
					position={[-8, 10, 6]}
					color="#fff0df"
					intensity={2.6}
					castShadow
					shadow-mapSize={[1024, 1024]}
					shadow-camera-left={-10}
					shadow-camera-right={10}
					shadow-camera-top={10}
					shadow-camera-bottom={-10}
					shadow-camera-near={0.1}
					shadow-camera-far={30}
					shadow-intensity={0.85}
					shadow-radius={2}
					shadow-bias={-0.0003}
					shadow-normalBias={0.02}
				/>
				<directionalLight
					position={[4, 2, 2]}
					color="#dde9ff"
					intensity={0.8}
				/>
				<directionalLight
					position={[1, 3, 5]}
					color="#f1edff"
					intensity={0.5}
				/>
			</group>
			<MovingSpotlight shelves={shelves} />
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
					position={[0, 2, 5]}
					target={[0, 0, 0]}
					scale={[5, 3, 1]}
					color="#f3efff"
					intensity={0.7}
				/>
			</Environment>
		</group>
	);
}
