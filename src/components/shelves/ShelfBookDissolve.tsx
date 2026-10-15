import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { MathUtils, type Texture } from "three";
import { useTourStore } from "../../stores/useTourStore";
import { createDissolveMaterial } from "../dissolve/components/createDissolveMaterial";

export default function ShelfBookDissolve({
	textures,
	startedAt,
	onComplete,
}: {
	textures: Texture[];
	startedAt?: number;
	onComplete: () => void;
}) {
	const completed = useRef(false);
	const editorElapsed = useRef(0);
	const uniforms = useMemo(
		() => ({
			uDissolveProgress: { value: 0 },
			uDissolveTime: { value: 0 },
		}),
		[],
	);
	const materials = useMemo(
		() => textures.map((texture) => createDissolveMaterial(texture, uniforms)),
		[textures, uniforms],
	);
	useEffect(() => {
		completed.current = false;
		editorElapsed.current = 0;
		uniforms.uDissolveProgress.value = 0;
		uniforms.uDissolveTime.value = startedAt ?? 0;
	}, [startedAt, uniforms]);
	useEffect(
		() => () => {
			for (const material of materials) material.dispose();
		},
		[materials],
	);
	useFrame((_, delta) => {
		if (startedAt === undefined || completed.current) return;
		const tour = useTourStore.getState();
		editorElapsed.current += Math.min(delta, 0.1);
		const elapsed = tour.stage === "delete" ? tour.elapsed - startedAt : editorElapsed.current;
		const progress = MathUtils.clamp(elapsed / 2.4, 0, 1);
		uniforms.uDissolveProgress.value = progress;
		uniforms.uDissolveTime.value = elapsed;
		if (progress === 1) {
			completed.current = true;
			onComplete();
		}
	});
	return materials.map((material, index) => (
		<primitive
			key={material.uuid}
			object={material}
			attach={`material-${index}`}
		/>
	));
}
