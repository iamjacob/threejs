import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BOOK_DIMENSIONS } from "../../book/bookTextures";
import type { BookData } from "../types";
import { createBookParticleGeometry } from "./colorExtractor";
import { particleFragmentShader, particleVertexShader } from "./shaders";

interface ParticleSystem3DProps {
	bookData: BookData;
	textures: THREE.Texture[];
	isParticleMode?: boolean;
	particleProgress?: number;
	resolution?: number;
}

export default function ParticleSystem3D({
	bookData,
	textures,
	isParticleMode = false,
	particleProgress = 0,
	resolution = 6400,
}: ParticleSystem3DProps) {
	const pointsRef = useRef<THREE.Points>(null);
	const width = bookData.scale?.width ?? BOOK_DIMENSIONS[0];
	const height = bookData.scale?.height ?? BOOK_DIMENSIONS[1];
	const thickness = bookData.scale?.thickness ?? BOOK_DIMENSIONS[2];
	const geometry = useMemo(
		() =>
			createBookParticleGeometry(
				textures,
				[width, height, thickness],
				resolution,
			),
		[textures, width, height, thickness, resolution],
	);
	const material = useMemo(
		() =>
			new THREE.ShaderMaterial({
				vertexShader: particleVertexShader,
				fragmentShader: particleFragmentShader,
				uniforms: {
					uProgress: { value: 0 },
					uTime: { value: 0 },
					uViewportHeight: { value: 1 },
				},
				transparent: true,
				blending: THREE.NormalBlending,
				depthWrite: false,
				toneMapped: false,
			}),
		[],
	);

	useEffect(() => () => geometry.dispose(), [geometry]);
	useEffect(() => () => material.dispose(), [material]);

	useFrame((state) => {
		material.uniforms.uProgress.value = particleProgress;
		material.uniforms.uTime.value = state.clock.elapsedTime;
		material.uniforms.uViewportHeight.value =
			state.size.height * state.gl.getPixelRatio();
		if (pointsRef.current) {
			pointsRef.current.rotation.y =
				Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
		}
	});

	if (!isParticleMode) return null;
	return (
		<points
			name="book-particles"
			ref={pointsRef}
			geometry={geometry}
			material={material}
			frustumCulled={false}
		/>
	);
}
