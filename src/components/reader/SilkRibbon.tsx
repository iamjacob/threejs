import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { DoubleSide, PlaneGeometry, type Group, Vector3 } from "three";

/** A tapered satin strip, pinned at its top with a softly twisting free tail. */
export default function SilkRibbon({
	length = 1,
	width = 0.12,
	color = "#bc1237",
	insertedAt = 0,
	throughBook = false,
	launch,
}: {
	length?: number;
	width?: number;
	color?: string;
	insertedAt?: number;
	throughBook?: boolean;
	launch?: { x: number; y: number };
}) {
	const flight = useRef<Group>(null);
	const origin = useRef<{ at: number; point: Vector3 } | null>(null);
	const geometry = useMemo(
		() => new PlaneGeometry(width, length, 4, 48),
		[width, length],
	);
	const reduced = useMemo(
		() =>
			typeof matchMedia !== "undefined" &&
			matchMedia("(prefers-reduced-motion: reduce)").matches,
		[],
	);
	useEffect(() => () => geometry.dispose(), [geometry]);
	useFrame(({ clock, camera, gl }) => {
		const positions = geometry.attributes.position;
		const progress =
			reduced || !insertedAt
				? 1
				: Math.min(1, Math.max(0, (Date.now() - insertedAt) / 1450));
		const ease =
			progress * progress * progress * (progress * (progress * 6 - 15) + 10);
		if (flight.current) {
			if (origin.current?.at !== insertedAt) {
				const parent = flight.current.parent;
				const point = new Vector3(length * 0.9, length * 0.45, length * 0.8);
				if (launch && parent) {
					parent.updateWorldMatrix(true, false);
					const depth = parent
						.getWorldPosition(new Vector3())
						.project(camera).z;
					const rect = gl.domElement.getBoundingClientRect();
					point
						.set(
							((launch.x - rect.left) / rect.width) * 2 - 1,
							1 - ((launch.y - rect.top) / rect.height) * 2,
							depth,
						)
						.unproject(camera);
					parent.worldToLocal(point);
				}
				origin.current = { at: insertedAt, point };
			}
			flight.current.position
				.copy(origin.current.point)
				.multiplyScalar(1 - ease);
			flight.current.position.y += Math.sin(progress * Math.PI) * length * 0.2;
			flight.current.position.z += Math.sin(progress * Math.PI) * length * 0.25;
			flight.current.scale.setScalar(0.06 + 0.94 * ease);
			flight.current.rotation.set(
				(1 - ease) * -0.65,
				(1 - ease) * 0.9,
				Math.sin(progress * Math.PI) * -0.5,
			);
		}
		const time = reduced ? 0 : clock.elapsedTime;
		for (let row = 0; row <= 48; row++) {
			const t = row / 48;
			// Keep the middle flat between the leaves; only the exposed ends flutter.
			const free = throughBook
				? Math.max(0, (t - 0.87) / 0.13, ((0.06 - t) / 0.06) * 0.25)
				: t;
			const twist = Math.sin(t * 7 - time * 1.2) * free * 0.85;
			for (let col = 0; col <= 4; col++) {
				const across = (col / 4 - 0.5) * width * (1 - t * 0.18);
				positions.setXYZ(
					row * 5 + col,
					Math.sin(t * 8 - time) * free * free * width * 0.65 +
						across * Math.cos(twist),
					-t * length +
						(row === 48 ? Math.abs(col / 4 - 0.5) * width * 0.4 : 0),
					Math.sin(t * 11 - time * 1.4) * free * free * width * 0.6 +
						across * Math.sin(twist),
				);
			}
		}
		positions.needsUpdate = true;
		geometry.computeVertexNormals();
	});
	return (
		<group ref={flight}>
			<mesh geometry={geometry}>
				<meshPhysicalMaterial
					color={color}
					roughness={0.32}
					metalness={0.22}
					sheen={1}
					sheenColor={color}
					sheenRoughness={0.35}
					side={DoubleSide}
				/>
			</mesh>
		</group>
	);
}
