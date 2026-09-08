import { useFBO } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";
import { usePresentationStore } from "../../stores/usePresentationStore";
import Book from "../book/book";
import { GlassMaterial, type SceneGlassMaterial } from "./SceneGlassMaterial";

const CensoredBook = () => {
	const blurEnabled = usePresentationStore((state) => state.blurEnabled);
	const meshRef = useRef<THREE.Mesh>(null);
	const materialRef = useRef<InstanceType<typeof SceneGlassMaterial>>(null);

	// Storage for the captured scene
	const renderTarget = useFBO();
	const { size } = useThree();

	useFrame((state) => {
		const mesh = meshRef.current;
		const material = materialRef.current;

		if (!blurEnabled || !mesh || !material) return;

		// Hide the pixel-glass mesh while capturing the scene
		mesh.visible = false;

		// Render the rest of the scene into the texture
		const previousTarget = state.gl.getRenderTarget();
		state.gl.setRenderTarget(renderTarget);
		state.gl.render(state.scene, state.camera);
		state.gl.setRenderTarget(previousTarget);

		// Pass the captured scene into the shader
		material.uSceneDiffuse = renderTarget.texture;
		material.uWinResolution.set(size.width, size.height);

		mesh.visible = true;
	});

	return (
		<group>
			{/* Anything behind the pixel glass */}
			<Book />

			{/* Pixel-glass box */}
			<mesh
				ref={meshRef}
				name="blur-filter"
				visible={blurEnabled}
				raycast={() => null}
				position={[0, 0, 0]}
				scale={[1.02, 1.02, 1.02]}
			>
				<boxGeometry args={[0.7, 1, 0.1]} />

				<GlassMaterial
					ref={materialRef}
					transparent
					uBlockSize={28}
					uColorLevels={4}
				/>
			</mesh>
		</group>
	);
};

export default CensoredBook;
