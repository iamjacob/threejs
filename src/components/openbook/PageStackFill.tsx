import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { type InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";

/** Cheap solid leaves fill the pages outside the small interactive curl window. */
export default function PageStackFill({
	pages,
	currentPage,
	width,
	height,
	thickness,
	closing,
}: {
	pages: number;
	currentPage: number;
	width: number;
	height: number;
	thickness: number;
	closing: boolean;
}) {
	const mesh = useRef<InstancedMesh>(null);
	const amount = useRef(closing ? 0 : 1);
	const dirty = useRef("");
	const scratch = useMemo(
		() => ({
			matrix: new Matrix4(),
			rotation: new Quaternion(),
			position: new Vector3(),
			axis: new Vector3(0, 1, 0),
			scale: new Vector3(1, 1, 1),
		}),
		[],
	);
	useFrame((_, delta) => {
		const target = closing ? 0 : 1;
		amount.current +=
			(target - amount.current) * (1 - Math.exp(-Math.min(delta, 0.1) * 8));
		if (Math.abs(amount.current - target) < 0.0001) amount.current = target;
		const revision = `${pages}:${currentPage}:${width}:${height}:${thickness}:${amount.current}`;
		if (!mesh.current || dirty.current === revision) return;
		dirty.current = revision;
		let count = 0;
		for (let i = 0; i < pages; i++) {
			if (
				i >= Math.max(0, currentPage - 4) &&
				i < Math.min(pages, currentPage + 5)
			)
				continue;
			const angle = (i >= currentPage ? 1 : -1) * amount.current;
			scratch.rotation.setFromAxisAngle(scratch.axis, angle);
			scratch.position
				.set(width / 2, 0, 0)
				.applyQuaternion(scratch.rotation)
				.add(
					new Vector3(
						-width / 2,
						0,
						thickness * 0.5 - ((i + 0.5) * thickness) / pages,
					),
				);
			scratch.matrix.compose(scratch.position, scratch.rotation, scratch.scale);
			mesh.current.setMatrixAt(count++, scratch.matrix);
		}
		mesh.current.count = count;
		mesh.current.instanceMatrix.needsUpdate = true;
		mesh.current.computeBoundingSphere();
	});
	return (
		<instancedMesh
			key={pages}
			ref={mesh}
			args={[undefined, undefined, pages]}
			castShadow
			receiveShadow
			raycast={() => {}}
		>
			<boxGeometry args={[width, height, thickness / pages]} />
			<meshStandardMaterial color="#eee9df" roughness={0.92} />
		</instancedMesh>
	);
}
