import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
	BoxGeometry,
	InstancedBufferAttribute,
	type InstancedMesh,
	Matrix4,
	MeshStandardMaterial,
	Quaternion,
	SRGBColorSpace,
	TextureLoader,
	Vector3,
} from "three";
import { BOOK_MATERIAL } from "../components/book/bookAppearance";
import { getBookTextureUrls } from "../components/book/bookTextures";
import type { ArrangedBook } from "../components/shelves/shelfArrangement";
import {
	type AtlasRect,
	COVER_ATLAS_PATH,
	coverAtlasRect,
	FULL_RECT,
} from "../lib/coverAtlas";
import { publicAssetUrl } from "../lib/publicAssetUrl";
import { currentRenderQuality, shelfAnisotropy } from "../lib/renderQuality";
import { falloffOpacity } from "./falloff";
import { flightProgress, flightShift } from "./flight";
import { type SettledPose, settlePoses } from "./selection";
import { journeySession } from "./session";

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

/**
 * Same atlas sampling as InstancedBooks, kept in this folder so the library
 * shelf component can move independently. Onboarding only flies catalog covers
 * that already live in the build-time atlas.
 */
function createAtlasMaterial(anisotropy: number) {
	const material = new MeshStandardMaterial({ ...BOOK_MATERIAL });
	material.customProgramCacheKey = () => "onboarding-cover-atlas";
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

const position = new Vector3();
const quaternion = new Quaternion();
const scale = new Vector3();
const matrix = new Matrix4();
const spin = new Quaternion();
const up = new Vector3(0, 1, 0);

function writeBooks(
	instanced: InstancedMesh,
	poses: readonly SettledPose[],
	clock: number,
	reduced: boolean,
) {
	for (let index = 0; index < poses.length; index += 1) {
		const pose = poses[index];
		const progress = flightProgress(clock, pose.delay, reduced);
		const shift = flightShift(progress, index, reduced);
		position.set(
			pose.position[0] + shift.x,
			pose.position[1] + shift.y,
			pose.position[2] + shift.z,
		);
		quaternion.set(
			pose.quaternion[0],
			pose.quaternion[1],
			pose.quaternion[2],
			pose.quaternion[3],
		);
		if (!reduced && progress < 1) {
			spin.setFromAxisAngle(up, shift.x * 0.35);
			quaternion.multiply(spin);
		}
		const settle = reduced || progress >= 1 ? 1 : 0.86 + 0.14 * progress;
		scale
			.set(pose.scale[0], pose.scale[1], pose.scale[2])
			.multiplyScalar(settle);
		matrix.compose(position, quaternion, scale);
		instanced.setMatrixAt(index, matrix);
	}
	instanced.instanceMatrix.needsUpdate = true;
}

type Props = {
	placements: ArrangedBook[];
	delays: Record<string, number>;
	clockRef: { current: number };
	reducedRef: { current: boolean };
};

export default function OnboardingBooks({
	placements,
	delays,
	clockRef,
	reducedRef,
}: Props) {
	const mesh = useRef<InstancedMesh>(null);
	const gl = useThree((state) => state.gl);
	const anisotropy = Math.min(
		shelfAnisotropy(currentRenderQuality()),
		gl.capabilities.getMaxAnisotropy(),
	);
	const atlas = useLoader(atlasLoader, publicAssetUrl(COVER_ATLAS_PATH));
	const poses = useMemo(
		() => settlePoses(placements, delays),
		[placements, delays],
	);
	const geometry = useMemo(() => {
		const clone = unitBox.clone();
		FACE_ATTRIBUTES.forEach((name, face) => {
			const data = new Float32Array(placements.length * 4);
			placements.forEach((placement, index) => {
				data.set(rectsFor(placement)[face], index * 4);
			});
			clone.setAttribute(name, new InstancedBufferAttribute(data, 4));
		});
		return clone;
	}, [placements]);
	const material = useMemo(() => createAtlasMaterial(anisotropy), [anisotropy]);
	useEffect(() => () => geometry.dispose(), [geometry]);
	useEffect(() => () => material.dispose(), [material]);
	atlas.colorSpace = SRGBColorSpace;
	atlas.anisotropy = anisotropy;
	if (material.map !== atlas) {
		material.map = atlas;
		material.needsUpdate = true;
	}
	useLayoutEffect(() => {
		const instanced = mesh.current;
		if (!instanced) return;
		writeBooks(instanced, poses, clockRef.current, reducedRef.current);
	}, [poses, clockRef, reducedRef]);
	useFrame(() => {
		const instanced = mesh.current;
		if (!instanced) return;
		writeBooks(instanced, poses, clockRef.current, reducedRef.current);
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
		<instancedMesh
			ref={mesh}
			args={[geometry, material, placements.length]}
			name="onboarding-books"
			frustumCulled={false}
			raycast={() => null}
		/>
	);
}
