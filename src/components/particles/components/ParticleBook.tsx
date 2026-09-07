import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { BookData, ParticlePhase } from "../types";

interface ParticleBookProps {
	bookData: BookData;
	phase: ParticlePhase;
	particleProgress?: number;
	bookScale: number;
}

const useSafeLoader = (
	url: string,
	fallbackUrl = "./covers/000.webp",
): THREE.Texture | null => {
	const [texture, setTexture] = useState<THREE.Texture | null>(null);

	useEffect(() => {
		let isActive = true;
		const loader = new THREE.TextureLoader();

		const configureTexture = (loadedTexture: THREE.Texture): void => {
			loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
			loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
			loadedTexture.minFilter = THREE.LinearFilter;
			loadedTexture.magFilter = THREE.LinearFilter;

			if (isActive) setTexture(loadedTexture);
		};

		loader.load(url, configureTexture, undefined, () => {
			loader.load(fallbackUrl, configureTexture);
		});

		return () => {
			isActive = false;
		};
	}, [url, fallbackUrl]);

	return texture;
};

const ParticleBook = ({
	bookData,
	phase,
	particleProgress = 0,
	bookScale,
}: ParticleBookProps) => {
	const meshRef = useRef<THREE.Mesh>(null);
	const bookWidth = bookData.scale?.width ?? 2;
	const bookHeight = bookData.scale?.height ?? 3;
	const bookThickness = bookData.scale?.thickness ?? 0.3;

	const geometry = useMemo(
		() =>
			new THREE.BoxGeometry(bookWidth, bookHeight, bookThickness, 64, 96, 16),
		[bookWidth, bookHeight, bookThickness],
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
			].map(
				(texture) =>
					new THREE.MeshStandardMaterial(
						texture
							? {
									map: texture,
									side: THREE.DoubleSide,
									transparent: true,
									opacity: 0,
								}
							: {
									color: "#8B4513",
									transparent: true,
									opacity: 0,
								},
					),
			),
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
		const opacity =
			phase === "forming"
				? THREE.MathUtils.smoothstep(particleProgress, 0.82, 1)
				: phase === "idle"
					? 0
					: 1;

		for (const material of materials) {
			material.opacity = opacity;
		}
	}, [phase, particleProgress, materials]);

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
		if (meshRef.current) {
			meshRef.current.rotation.y =
				Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
			meshRef.current.scale.setScalar(bookScale);
		}
	});

	const showBook =
		phase === "visible" ||
		phase === "shrinking" ||
		(phase === "forming" && particleProgress >= 0.82);

	if (!showBook) return null;

	return (
		<mesh
			ref={meshRef}
			geometry={geometry}
			material={materials}
			position={[0, 0, 0]}
		/>
	);
};

export default ParticleBook;
