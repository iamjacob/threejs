import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry } from "three";
import { BOOK_DIMENSIONS, useBookTextures } from "../../book/bookAppearance";
import { createDissolveMaterial } from "./createDissolveMaterial";
import DissolveParticles from "./DissolveParticles";

export default function DissolveBook({
	dissolveProgress,
}: {
	dissolveProgress: number;
}) {
	const textures = useBookTextures();
	const geometry = useMemo(
		() => new BoxGeometry(...BOOK_DIMENSIONS, 32, 32, 8),
		[],
	);
	const uniforms = useMemo(
		() => ({
			uDissolveProgress: { value: 0 },
			uDissolveTime: { value: 0 },
		}),
		[],
	);
	const materials = useMemo(
		() => textures.map((map) => createDissolveMaterial(map, uniforms)),
		[textures, uniforms],
	);

	useEffect(() => {
		uniforms.uDissolveProgress.value = dissolveProgress;
	}, [dissolveProgress, uniforms]);
	useEffect(() => () => geometry.dispose(), [geometry]);
	useEffect(
		() => () => {
			for (const material of materials) material.dispose();
		},
		[materials],
	);
	useFrame((state) => {
		uniforms.uDissolveTime.value = state.clock.elapsedTime;
	});

	return (
		<group name="dissolve-book">
			<mesh
				name="dissolve-cover"
				geometry={geometry}
				material={materials}
				visible={dissolveProgress < 1}
			/>
			{dissolveProgress > 0 && dissolveProgress < 1 && (
				<DissolveParticles
					dissolveProgress={dissolveProgress}
					bookGeometry={geometry}
				/>
			)}
		</group>
	);
}
