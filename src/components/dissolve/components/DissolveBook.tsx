import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import DissolveParticles from "./DissolveParticles";
import { dissolveFragmentShader, dissolveVertexShader } from "./shaders";

interface DissolveBookProps {
	dissolveProgress: number;
}

const useSafeLoader = (
	url: string,
	fallbackUrl = "./covers/000.webp",
): THREE.Texture | null => {
	const [texture, setTexture] = useState<THREE.Texture | null>(null);

	useEffect(() => {
		let isActive = true;
		const loader = new THREE.TextureLoader();

		const handleTexture = (loadedTexture: THREE.Texture): void => {
			if (isActive) setTexture(loadedTexture);
		};

		loader.load(url, handleTexture, undefined, () => {
			loader.load(fallbackUrl, handleTexture);
		});

		return () => {
			isActive = false;
		};
	}, [url, fallbackUrl]);

	return texture;
};

const createDissolveMaterial = (
	texture: THREE.Texture | null,
): THREE.Material => {
	if (!texture) return new THREE.MeshStandardMaterial({ color: "#8B4513" });

	return new THREE.ShaderMaterial({
		vertexShader: dissolveVertexShader,
		fragmentShader: dissolveFragmentShader,
		uniforms: {
			uTime: { value: 0 },
			uProgress: { value: -1.2 },
			uEdge: { value: 0.2 },
			uFreq: { value: 2 },
			uAmp: { value: 1 },
			uTexture: { value: texture },
			uColor: { value: new THREE.Color("#ffffff") },
			uEdgeColor: { value: new THREE.Color("#ff4400") },
		},
		side: THREE.DoubleSide,
		transparent: false,
	});
};

const DissolveBook = ({ dissolveProgress }: DissolveBookProps) => {
	const meshRef = useRef<THREE.Mesh>(null);
	const geometry = useMemo(
		() => new THREE.BoxGeometry(0.7, 1, 0.1, 32, 32, 8),
		[],
	);

	const sideTexture = useSafeLoader(
		"/experience/books/assets/booktextureSide.webp",
	);
	const spineTexture = useSafeLoader(
		"/blockchain/m/i/mit_liv_med_fangekoret-00000001/cover/spine.webp",
	);
	const edgeTexture = useSafeLoader(
		"/experience/books/assets/booktexture.webp",
	);
	const frontTexture = useSafeLoader(
		"/experience/books/assets/booktexture.webp",
	);
	const topTexture = useSafeLoader(
		"/blockchain/m/i/mit_liv_med_fangekoret-00000001/cover/front.webp",
	);
	const backTexture = useSafeLoader(
		"/blockchain/m/i/mit_liv_med_fangekoret-00000001/cover/back.webp",
	);

	const materials = useMemo(
		() =>
			[
				sideTexture,
				spineTexture,
				edgeTexture,
				frontTexture,
				topTexture,
				backTexture,
			].map(createDissolveMaterial),
		[
			sideTexture,
			spineTexture,
			edgeTexture,
			frontTexture,
			topTexture,
			backTexture,
		],
	);

	useEffect(() => {
		const shaderProgress = THREE.MathUtils.lerp(-1.2, 1.2, dissolveProgress);

		for (const material of materials) {
			if (material instanceof THREE.ShaderMaterial) {
				material.uniforms.uProgress.value = shaderProgress;
			}
		}
	}, [dissolveProgress, materials]);

	useEffect(
		() => () => {
			geometry.dispose();
		},
		[geometry],
	);

	useEffect(
		() => () => {
			for (const material of materials) material.dispose();
		},
		[materials],
	);

	useFrame((state) => {
		for (const material of materials) {
			if (material instanceof THREE.ShaderMaterial) {
				material.uniforms.uTime.value = state.clock.elapsedTime;
			}
		}

		if (meshRef.current) {
			meshRef.current.rotation.y =
				Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
		}
	});

	return (
		<group>
			{dissolveProgress < 0.9 && (
				<mesh
					ref={meshRef}
					geometry={geometry}
					material={materials}
					position={[0, 0, 0]}
				/>
			)}

			<DissolveParticles
				dissolveProgress={dissolveProgress}
				bookGeometry={geometry}
			/>
		</group>
	);
};

export default DissolveBook;
