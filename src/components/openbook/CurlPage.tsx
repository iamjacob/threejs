import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useReaderPreferences } from "../../stores/useReaderPreferences";
import { curlPagePoint } from "./pageCurl";

interface Props {
	width: number;
	height: number;
	thickness: number;
	index: number;
	onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
}

export function CurlPage({
	width,
	height,
	thickness,
	index,
	onPointerDown,
}: Props) {
	const mesh = useRef<THREE.Mesh<THREE.BoxGeometry>>(null);
	const original = useRef<Float32Array | null>(null);
	const previous = useRef("");
	useFrame(() => {
		const page = mesh.current;
		if (!page?.parent) return;
		const angle = page.parent.rotation.y;
		// Flat on each stack and when closed; flexible while travelling between them.
		const weight = Number(page.parent.userData.curlDragWeight ?? 0);
		const automaticBend = Math.sin(angle * Math.PI) * (1.9 * 1.33);
		const bend = useReaderPreferences.getState().pageCurl
			? automaticBend * (1 - weight) +
				Number(page.parent.userData.curlDragBend ?? 0) * weight
			: 0;
		const corner = Number(page.parent.userData.curlCorner ?? 0);
		const key = `${bend.toFixed(5)}:${corner.toFixed(3)}`;
		if (previous.current === key) return;
		previous.current = key;
		const positions = page.geometry.attributes.position;
		original.current ??= new Float32Array(positions.array);
		for (let i = 0; i < positions.count; i++) {
			const x = original.current[i * 3] + width / 2;
			const y = original.current[i * 3 + 1];
			const point = curlPagePoint(x, y, width, height, bend, corner);
			positions.setXYZ(
				i,
				point.x - width / 2,
				point.y,
				point.z + original.current[i * 3 + 2],
			);
		}
		positions.needsUpdate = true;
		page.geometry.computeVertexNormals();
		page.geometry.computeBoundingSphere();
	});
	return (
		<mesh
			ref={mesh}
			castShadow
			receiveShadow
			position={[width / 2, 0, 0]}
			onPointerDown={onPointerDown}
			onClick={(event) => event.stopPropagation()}
		>
			<boxGeometry args={[width, height, thickness, 40, 24, 1]} />
			<meshStandardMaterial
				roughness={0.9}
				color={index % 2 === 0 ? "white" : "#f5f1e8"}
			/>
		</mesh>
	);
}
