import { type ThreeEvent, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
	BoxGeometry,
	Euler,
	InstancedBufferAttribute,
	type InstancedMesh,
	Matrix4,
	MeshStandardMaterial,
	Quaternion,
	SRGBColorSpace,
	TextureLoader,
	Vector3,
} from "three";
import {
	type AtlasRect,
	COVER_ATLAS_PATH,
	coverAtlasRect,
	FULL_RECT,
} from "../../lib/coverAtlas";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { BOOK_MATERIAL } from "../book/bookAppearance";
import { getBookTextureUrls } from "../book/bookTextures";
import type { ArrangedBook } from "./shelfArrangement";
import { groupBySector } from "./shelfSectors";

export type InstancedBookEntry = { placement: ArrangedBook };
type Props = {
	placements: ArrangedBook[];
	onPointerDown?: (book: ArrangedBook, event: ThreeEvent<PointerEvent>) => void;
	onClick?: (book: ArrangedBook, event: ThreeEvent<MouseEvent>) => void;
	onPointerOver?: (book: ArrangedBook, event: ThreeEvent<PointerEvent>) => void;
	onPointerOut?: (book: ArrangedBook, event: ThreeEvent<PointerEvent>) => void;
};

// BoxGeometry face order: +X (fore edge), -X (spine), +Y, -Y, +Z (front), -Z (back).
const FACE_ATTRIBUTES = [
	"aRectEdge",
	"aRectSpine",
	"aRectTop",
	"aRectBottom",
	"aRectFront",
	"aRectBack",
] as const;

const unitBox = new BoxGeometry(1, 1, 1);
const atlasLoader = new TextureLoader();

function createAtlasMaterial(anisotropy: number) {
	const material = new MeshStandardMaterial({ ...BOOK_MATERIAL });
	material.customProgramCacheKey = () => "shelf-cover-atlas";
	material.onBeforeCompile = (shader) => {
		shader.vertexShader = shader.vertexShader
			.replace(
				"#include <common>",
				`#include <common>
				attribute vec4 aRectEdge;
				attribute vec4 aRectSpine;
				attribute vec4 aRectTop;
				attribute vec4 aRectBottom;
				attribute vec4 aRectFront;
				attribute vec4 aRectBack;
				vec4 bookFaceRect() {
					vec3 n = abs(normal);
					if (n.x > 0.5) return normal.x > 0.0 ? aRectEdge : aRectSpine;
					if (n.y > 0.5) return normal.y > 0.0 ? aRectTop : aRectBottom;
					return normal.z > 0.0 ? aRectFront : aRectBack;
				}`,
			)
			.replace(
				"#include <uv_vertex>",
				`#include <uv_vertex>
				#ifdef USE_MAP
				{
					vec4 rect = bookFaceRect();
					vMapUv = rect.xy + uv * rect.zw;
				}
				#endif`,
			);
	};
	material.userData.anisotropy = anisotropy;
	return material;
}

function rectsFor(placement: ArrangedBook): AtlasRect[] {
	return getBookTextureUrls(placement.book.cover).map(
		(url) => coverAtlasRect(url) ?? FULL_RECT,
	);
}

function SectorBatch({
	items,
	material,
	onPointerDown,
	onClick,
	onPointerOver,
	onPointerOut,
}: Omit<Props, "placements"> & {
	items: InstancedBookEntry[];
	material: MeshStandardMaterial;
}) {
	const mesh = useRef<InstancedMesh>(null);
	const geometry = useMemo(() => {
		const clone = unitBox.clone();
		const count = items.length;
		FACE_ATTRIBUTES.forEach((name, face) => {
			const data = new Float32Array(count * 4);
			items.forEach(({ placement }, index) => {
				data.set(rectsFor(placement)[face], index * 4);
			});
			clone.setAttribute(name, new InstancedBufferAttribute(data, 4));
		});
		return clone;
	}, [items]);
	useEffect(() => () => geometry.dispose(), [geometry]);
	useLayoutEffect(() => {
		const instanced = mesh.current;
		if (!instanced) return;
		const matrix = new Matrix4();
		const position = new Vector3();
		const quaternion = new Quaternion();
		const scale = new Vector3();
		items.forEach(({ placement }, index) => {
			position.set(...placement.position);
			quaternion.setFromEuler(new Euler(...placement.rotation));
			scale.set(...placement.book.dimensions).multiplyScalar(placement.scale);
			matrix.compose(position, quaternion, scale);
			instanced.setMatrixAt(index, matrix);
		});
		instanced.count = items.length;
		instanced.instanceMatrix.needsUpdate = true;
		instanced.computeBoundingSphere();
	}, [items]);
	const bookAt = (event: { instanceId?: number }) =>
		event.instanceId === undefined ? undefined : items[event.instanceId];
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Canvas books; the Open book button offers a keyboard alternative.
		<instancedMesh
			ref={mesh}
			args={[geometry, material, items.length]}
			castShadow
			receiveShadow
			userData={{
				instancedBooks: items.map(({ placement }) => placement.book.id),
			}}
			onPointerDown={(event) => {
				const entry = bookAt(event);
				if (entry && onPointerDown) onPointerDown(entry.placement, event);
			}}
			onClick={(event) => {
				const entry = bookAt(event);
				if (entry && onClick) onClick(entry.placement, event);
			}}
			onPointerOver={(event) => {
				const entry = bookAt(event);
				if (entry && onPointerOver) onPointerOver(entry.placement, event);
			}}
			onPointerOut={(event) => {
				const entry = bookAt(event);
				if (entry && onPointerOut) onPointerOut(entry.placement, event);
			}}
		/>
	);
}

/**
 * Draws every static shelf book from one material and the shared cover atlas,
 * batched per ring sector so off-screen sectors cost nothing.
 */
export default function InstancedBooks({ placements, ...handlers }: Props) {
	const anisotropy = useThree((state) =>
		Math.min(4, state.gl.capabilities.getMaxAnisotropy()),
	);
	const atlas = useLoader(atlasLoader, publicAssetUrl(COVER_ATLAS_PATH));
	const material = useMemo(() => createAtlasMaterial(anisotropy), [anisotropy]);
	useEffect(() => {
		atlas.colorSpace = SRGBColorSpace;
		atlas.anisotropy = anisotropy;
		atlas.generateMipmaps = true;
		atlas.needsUpdate = true;
		material.map = atlas;
		material.needsUpdate = true;
	}, [atlas, material, anisotropy]);
	useEffect(() => () => material.dispose(), [material]);
	const sectors = useMemo(
		() => groupBySector(placements.map((placement) => ({ placement }))),
		[placements],
	);
	return (
		<>
			{sectors.map(({ sector, items }) => (
				<SectorBatch
					key={sector}
					items={items}
					material={material}
					{...handlers}
				/>
			))}
		</>
	);
}
