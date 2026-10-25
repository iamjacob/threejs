import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
	type Mesh,
	MeshStandardMaterial,
	SRGBColorSpace,
	TextureLoader,
} from "three";
import { falloffOpacity } from "./falloff";
import { flightProgress, flightShift } from "./flight";
import { journeySession } from "./session";

type Props = {
	coverUrl: string;
	delay: number;
	offsetX: number;
	clockRef: { current: number };
	reducedRef: { current: boolean };
};

/** One cover, outside the atlas, flying onto the front of a landing shelf. */
export default function PersonalCover({
	coverUrl,
	delay,
	offsetX,
	clockRef,
	reducedRef,
}: Props) {
	const mesh = useRef<Mesh>(null);
	const material = useMemo(
		() => new MeshStandardMaterial({ roughness: 0.62 }),
		[],
	);
	useEffect(() => {
		let alive = true;
		const loader = new TextureLoader();
		const texture = loader.load(coverUrl, (loaded) => {
			if (!alive) return;
			loaded.colorSpace = SRGBColorSpace;
			material.map = loaded;
			material.needsUpdate = true;
		});
		return () => {
			alive = false;
			texture.dispose();
			material.map = null;
		};
	}, [coverUrl, material]);
	useEffect(() => () => material.dispose(), [material]);
	useFrame(() => {
		const current = mesh.current;
		if (!current) return;
		const progress = flightProgress(
			clockRef.current,
			delay,
			reducedRef.current,
		);
		const shift = flightShift(progress, 0, reducedRef.current);
		const settle =
			reducedRef.current || progress >= 1 ? 1 : 0.86 + 0.14 * progress;
		current.position.set(offsetX + shift.x, 0.42 + shift.y, shift.z);
		current.scale.setScalar(settle);
		const fade = falloffOpacity(journeySession.falloff.elapsed);
		const transparent = fade < 0.999;
		if (material.transparent !== transparent) {
			material.transparent = transparent;
			material.needsUpdate = true;
		}
		material.opacity = fade;
		material.depthWrite = fade > 0.2;
	});
	return (
		<mesh ref={mesh} position={[offsetX, 0.42, 0]} raycast={() => null}>
			<boxGeometry args={[0.46, 0.68, 0.08]} />
			<primitive object={material} attach="material" />
		</mesh>
	);
}
