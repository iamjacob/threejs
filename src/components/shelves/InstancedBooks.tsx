import {
	type ThreeEvent,
	useFrame,
	useLoader,
	useThree,
} from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
	BoxGeometry,
	Color,
	InstancedBufferAttribute,
	type InstancedMesh,
	Matrix4,
	MeshStandardMaterial,
	SRGBColorSpace,
	TextureLoader,
} from "three";
import {
	type AtlasRect,
	COVER_ATLAS_PATH,
	coverAtlasRect,
	coverFacesOutsideAtlas,
	FULL_RECT,
} from "../../lib/coverAtlas";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import {
	runtimeAtlasRect,
	setBaseAtlasImage,
	suspendUntilAtlasReady,
	useRuntimeAtlas,
} from "../../lib/runtimeAtlas";

import { BOOK_MATERIAL } from "../book/bookAppearance";
import { getBookTextureUrls } from "../book/bookTextures";
import {
	composeShelfBook,
	dampToward,
	pressEnvelope,
	warmBookColor,
} from "./bookHover";
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
useLoader.preload(atlasLoader, publicAssetUrl(COVER_ATLAS_PATH));

/**
 * One material samples a single unified atlas (`map`) that holds every
 * build-time catalog cover plus any local/scanned covers packed at runtime.
 */
function createAtlasMaterial(anisotropy: number) {
	const material = new MeshStandardMaterial({ ...BOOK_MATERIAL });
	material.customProgramCacheKey = () => "shelf-cover-atlas-v3";
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
		(url) => runtimeAtlasRect(url) ?? coverAtlasRect(url) ?? FULL_RECT,
	);
}

/** Instanced when every face is in the unified atlas. */
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
	const emphasis = useRef(new Float32Array(0));
	const pulseAge = useRef(new Float32Array(0));
	const active = useRef(new Set<number>());
	const hoverIndex = useRef(-1);
	const scratchMatrix = useRef(new Matrix4());
	const scratchColor = useRef(new Color());
	const reducedMotion = useMemo(
		() => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		[],
	);
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
		const matrix = scratchMatrix.current;
		items.forEach(({ placement }, index) => {
			instanced.setMatrixAt(index, composeShelfBook(placement, 0, matrix));
		});
		instanced.count = items.length;
		instanced.instanceMatrix.needsUpdate = true;
		// Present from the first frame so the atlas shader compiles with
		// USE_INSTANCING_COLOR instead of hitching on the first hover.
		const colors = new InstancedBufferAttribute(
			new Float32Array(items.length * 3).fill(1),
			3,
		);
		instanced.instanceColor = colors;
		instanced.computeBoundingSphere();
		// Hover lifts the book slightly past the rest bounds.
		if (instanced.boundingSphere) instanced.boundingSphere.radius += 0.12;
		emphasis.current = new Float32Array(items.length);
		pulseAge.current = new Float32Array(items.length).fill(-1);
		active.current = new Set();
		hoverIndex.current = -1;
	}, [items]);
	// The shadow pass redraws every caster; distant sectors contribute nothing
	// visible, so only sectors within shadowDistance of the camera cast.
	const shadowCheck = useRef(0);
	useFrame(({ camera, clock }, delta) => {
		const instanced = mesh.current;
		if (!instanced) return;
		// Settled books are taken out of the set, so an idle frame writes nothing.
		if (active.current.size > 0) {
			const dt = Math.min(Math.max(delta, 0), 0.1);
			const finished: number[] = [];
			let wrote = false;
			for (const index of active.current) {
				const placement = items[index]?.placement;
				if (!placement) {
					finished.push(index);
					continue;
				}
				let age = pulseAge.current[index] ?? -1;
				if (age >= 0) age += dt;
				const pulse = pressEnvelope(age);
				pulseAge.current[index] = pulse === 0 ? -1 : age;
				const target = hoverIndex.current === index ? 1 : pulse;
				const current = emphasis.current[index] ?? 0;
				const next = dampToward(current, target, delta, reducedMotion);
				if (Math.abs(next - current) >= 0.00001) {
					emphasis.current[index] = next;
					instanced.setMatrixAt(
						index,
						composeShelfBook(placement, next, scratchMatrix.current),
					);
					instanced.setColorAt(
						index,
						warmBookColor(next, scratchColor.current),
					);
					wrote = true;
				}
				// Stay active through the press release; a settled hover can sleep.
				if (next === target && pulse === 0) finished.push(index);
			}
			if (wrote) {
				instanced.instanceMatrix.needsUpdate = true;
				if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
			}
			for (const index of finished) active.current.delete(index);
		}
		if (clock.elapsedTime < shadowCheck.current) return;
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
				if (entry && event.instanceId !== undefined) {
					pulseAge.current[event.instanceId] = 0;
					active.current.add(event.instanceId);
				}
				if (entry && onPointerDown) onPointerDown(entry.placement, event);
			}}
			onClick={(event) => {
				const entry = bookAt(event);
				if (entry && onClick) onClick(entry.placement, event);
			}}
			onPointerOver={(event) => {
				const entry = bookAt(event);
				if (entry && event.instanceId !== undefined) {
					hoverIndex.current = event.instanceId;
					active.current.add(event.instanceId);
				}
				if (entry && onPointerOver) onPointerOver(entry.placement, event);
			}}
			onPointerOut={(event) => {
				const entry = bookAt(event);
				const previous = hoverIndex.current;
				if (event.instanceId === undefined || previous === event.instanceId) {
					hoverIndex.current = -1;
					if (previous >= 0) active.current.add(previous);
				}
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
	const gl = useThree((state) => state.gl);
	const anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
	const atlas = useLoader(atlasLoader, publicAssetUrl(COVER_ATLAS_PATH));
	setBaseAtlasImage(atlas.image);
	suspendUntilAtlasReady(
		placements.flatMap(({ book }) => coverFacesOutsideAtlas(book.cover)),
	);
	const runtimeTexture = useRuntimeAtlas((state) => state.texture);
	const active = runtimeTexture ?? atlas;
	const material = useMemo(() => createAtlasMaterial(anisotropy), [anisotropy]);
	// Bind and upload the active atlas synchronously during render so vertex UV
	// attributes and `material.map` always commit on the exact same frame.
	active.colorSpace = SRGBColorSpace;
	active.anisotropy = anisotropy;
	active.generateMipmaps = true;
	if (material.map !== active) {
		active.needsUpdate = true;
		material.map = active;
		material.needsUpdate = true;
		gl.initTexture(active);
	}
	useEffect(() => {
		if (runtimeTexture) atlas.dispose();
	}, [atlas, runtimeTexture]);
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
