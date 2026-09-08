import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BOOK_DIMENSIONS, BOOK_MATERIAL } from "../../book/bookAppearance";
import type { BookData, ParticlePhase } from "../types";

interface ParticleBookProps {
	bookData: BookData;
	textures: THREE.Texture[];
	phase: ParticlePhase;
	particleProgress?: number;
	bookScale: number;
}

const ParticleBook = ({
	bookData,
	textures,
	phase,
	particleProgress = 0,
	bookScale,
}: ParticleBookProps) => {
	const meshRef = useRef<THREE.Mesh>(null);
	const bookWidth = bookData.scale?.width ?? BOOK_DIMENSIONS[0];
	const bookHeight = bookData.scale?.height ?? BOOK_DIMENSIONS[1];
	const bookThickness = bookData.scale?.thickness ?? BOOK_DIMENSIONS[2];

	const geometry = useMemo(
		() =>
			new THREE.BoxGeometry(bookWidth, bookHeight, bookThickness, 64, 96, 16),
		[bookWidth, bookHeight, bookThickness],
	);

	const materials = useMemo(
		() =>
			textures.map(
				(map) =>
					new THREE.MeshStandardMaterial({
						...BOOK_MATERIAL,
						map,
						transparent: true,
						opacity: 0,
					}),
			),
		[textures],
	);

	useEffect(() => {
		const opacity =
			phase === "forming"
				? THREE.MathUtils.smoothstep(particleProgress, 0.9, 1)
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
		(phase === "forming" && particleProgress >= 0.9);

	if (!showBook) return null;

	return (
		<mesh
			name="particle-book"
			ref={meshRef}
			geometry={geometry}
			material={materials}
			position={[0, 0, 0]}
		/>
	);
};

export default ParticleBook;
