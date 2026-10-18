import {
	type ThreeEvent,
	useFrame,
	useLoader,
	useThree,
} from "@react-three/fiber";
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
	type Texture,
	TextureLoader,
	Vector3,
} from "three";
import {
	type AtlasRect,
	COVER_ATLAS_PATH,
	coverAtlasRect,
	coverFacesOutsideAtlas,
	FULL_RECT,
} from "../../lib/coverAtlas";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { runtimeAtlasRect, useRuntimeAtlas } from "../../lib/runtimeAtlas";
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
/** World units; the shelf radius is 7.4 so this spans roughly the visible arc. */
const shadowDistance = 9;
const atlasLoader = new TextureLoader();

/**
 * One material samples two atlases: the build-time cover atlas (`map`) and the
 * runtime atlas of device-only scanned covers (`uRuntimeAtlas`). A negative
 * rect width marks a face that lives in the runtime atlas.
 */
function createAtlasMaterial(anisotropy: number) {
	const material = new MeshStandardMaterial({ ...BOOK_MATERIAL });
	const uniforms = { uRuntimeAtlas: { value: null as Texture | null } };
	material.userData.uniforms = uniforms;
	material.customProgramCacheKey = () => "shelf-cover-atlas-v2";
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uRuntimeAtlas = uniforms.uRuntimeAtlas;
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
				varying float vRuntimeAtlas;
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
					vRuntimeAtlas = rect.z < 0.0 ? 1.0 : 0.0;
					vMapUv = rect.xy + uv * vec2(abs(rect.z), rect.w);
				}
				#endif`,
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				"#include <common>",
				`#include <common>
				uniform sampler2D uRuntimeAtlas;
				varying float vRuntimeAtlas;`,
			)
			.replace(
				"#include <map_fragment>",
				`#ifdef USE_MAP
				{
					vec4 sampledDiffuseColor = vRuntimeAtlas > 0.5
						? texture2D( uRuntimeAtlas, vMapUv )
						: texture2D( map, vMapUv );
					#ifdef DECODE_VIDEO_TEXTURE
						sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
					#endif
					diffuseColor *= sampledDiffuseColor;
				}
				#endif`,
			);
	};
	material.userData.anisotropy = anisotropy;
	return material;
}

function rectsFor(placement: ArrangedBook): AtlasRect[] {
	return getBookTextureUrls(placement.book.cover).map((url) => {
		const built = coverAtlasRect(url);
		if (built) return built;
		const runtime = runtimeAtlasRect(url);
		// Negative width flags the runtime atlas for the shader.
		if (runtime) return [runtime[0], runtime[1], -runtime[2], runtime[3]];
		return FULL_RECT;
	});
}

/** Instanced when every face is in either atlas. */
export function coverInstanceable(cover: {
	front: string;
	back: string;
	spine: string;
}) {
	return coverFacesOutsideAtlas(cover).every(
		(face) => runtimeAtlasRect(face) !== undefined,
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
	// Rects move when the runtime atlas is repacked, so rebuild on its version.
	const atlasVersion = useRuntimeAtlas((state) => state.version);
	// biome-ignore lint/correctness/useExhaustiveDependencies: atlasVersion invalidates rectsFor() results.
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
	}, [items, atlasVersion]);
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
	// The shadow pass redraws every caster; distant sectors contribute nothing
	// visible, so only sectors within shadowDistance of the camera cast.
	const shadowCheck = useRef(0);
	useFrame(({ camera, clock }) => {
		const instanced = mesh.current;
		if (!instanced || clock.elapsedTime < shadowCheck.current) return;
		shadowCheck.current = clock.elapsedTime + 0.25;
		const sphere = instanced.boundingSphere;
		if (!sphere) return;
		instanced.updateWorldMatrix(true, false);
		const center = sphere.center.clone().applyMatrix4(instanced.matrixWorld);
		const distance = center.distanceTo(camera.position) - sphere.radius;
		instanced.castShadow = distance < shadowDistance;
	});
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
	const runtimeTexture = useRuntimeAtlas((state) => state.texture);
	useEffect(() => {
		// Bind the runtime atlas (or the main atlas as a harmless placeholder so
		// the sampler is never empty).
		const uniforms = material.userData.uniforms as {
			uRuntimeAtlas: { value: Texture | null };
		};
		if (runtimeTexture) runtimeTexture.anisotropy = anisotropy;
		uniforms.uRuntimeAtlas.value = runtimeTexture ?? atlas;
	}, [runtimeTexture, atlas, material, anisotropy]);
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
