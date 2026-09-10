import { useFBO } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import {
	GlassMaterial,
	type SceneGlassMaterial,
} from "../blur/SceneGlassMaterial";
import type { layoutShelfBooks } from "./shelfBooks";

export default function CollectionBlur({
	placements,
}: {
	placements: ReturnType<typeof layoutShelfBooks>;
}) {
	const filters = useRef<Group>(null);
	const materials = useRef(
		new Map<string, InstanceType<typeof SceneGlassMaterial>>(),
	);
	const renderTarget = useFBO();
	const size = useThree((state) => state.size);
	useFrame((state) => {
		if (!filters.current) return;
		const previousTarget = state.gl.getRenderTarget();
		filters.current.visible = false;
		try {
			state.gl.setRenderTarget(renderTarget);
			state.gl.render(state.scene, state.camera);
		} finally {
			state.gl.setRenderTarget(previousTarget);
			filters.current.visible = true;
		}
		for (const material of materials.current.values()) {
			material.uSceneDiffuse = renderTarget.texture;
			material.uWinResolution.set(size.width, size.height);
		}
	});
	return (
		<group ref={filters} name="shelf-glass-filters">
			{placements.map(({ book, position, rotation }) => (
				<group key={book.id} position={position} rotation={rotation}>
					<mesh name={`blur-filter-${book.id}`} raycast={() => null}>
						<boxGeometry
							args={[
								book.dimensions[0] + 0.05,
								book.dimensions[1] + 0.05,
								book.dimensions[2] + 0.05,
							]}
						/>
						<GlassMaterial
							ref={(material) => {
								if (material) materials.current.set(book.id, material);
								else materials.current.delete(book.id);
							}}
							transparent
							depthWrite={false}
							uBlockSize={12}
							uColorLevels={12}
						/>
					</mesh>
				</group>
			))}
		</group>
	);
}
