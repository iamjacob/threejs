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
		uniforms.uDissolveProgress.value = 0;
		uniforms.uDissolveTime.value = startedAt ?? 0;
	}, [startedAt, uniforms]);
	useEffect(
		() => () => {
			for (const material of materials) material.dispose();
		},
		[materials],
	);
	useFrame(() => {
		if (startedAt === undefined || completed.current) return;
		const tour = useTourStore.getState();
		if (tour.stage !== "delete") return;
		const progress = MathUtils.clamp((tour.elapsed - startedAt) / 2.4, 0, 1);
		uniforms.uDissolveProgress.value = progress;
		uniforms.uDissolveTime.value = tour.elapsed;
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
