import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
	BackSide,
	CatmullRomCurve3,
	Color,
	DoubleSide,
	ExtrudeGeometry,
	Fog,
	type Group,
	type InstancedMesh,
	Matrix4,
	MeshStandardMaterial,
	type PerspectiveCamera as PerspectiveCameraImpl,
	Quaternion,
	RepeatWrapping,
	ShaderMaterial,
	Shape,
	SRGBColorSpace,
	TextureLoader,
	Vector3,
} from "three";
import { books as catalog } from "../lib/bookCatalog";
import { publicAssetUrl } from "../lib/publicAssetUrl";
import OnboardingBooks from "./books";
import {
	beatAt,
	eyeBackoff,
	frameDelta,
	frictionAt,
	JOURNEY_SECONDS,
	type JourneyState,
	MAX_PROGRESS_PER_SECOND,
	ringCount,
	skyAt,
	soundtrackDrives,
	stepJourney,
	trackProgress,
} from "./journey";
import {
	type OnboardingAnswers,
	plankFor,
	planLandings,
	settlePoses,
} from "./selection";

const CURVE_DISTANCE = 250;
const RING_INNER = 6.35;
const RING_OUTER = 8;
const RING_SCALE = 0.8;

const SHELF_TEXTURES = [
	"/experience/shelf/Wood051_1K-JPG_Color.webp",
	"/experience/shelf/Wood051_1K-JPG_NormalGL.webp",
	"/experience/shelf/Wood051_1K-JPG_Roughness.webp",
];

export function createJourneyCurve() {
	return new CatmullRomCurve3(
		[
			new Vector3(0, 0, 0),
			new Vector3(0, 0, -CURVE_DISTANCE),
			new Vector3(100, 0, -2 * CURVE_DISTANCE),
			new Vector3(-100, 0, -3 * CURVE_DISTANCE),
			new Vector3(100, 0, -4 * CURVE_DISTANCE),
			new Vector3(0, 0, -5 * CURVE_DISTANCE),
			new Vector3(0, 0, -6 * CURVE_DISTANCE),
			new Vector3(0, 0, -7 * CURVE_DISTANCE),
		],
		false,
		"catmullrom",
		0.5,
	);
}

function createAnnulus(fraction: number, segments: number, depth: number) {
	const arc = Math.PI * 2 * fraction;
	const start = -arc / 2;
	const end = arc / 2;
	const shape = new Shape();
	shape.moveTo(Math.cos(start) * RING_OUTER, Math.sin(start) * RING_OUTER);
	shape.absarc(0, 0, RING_OUTER, start, end, false);
	shape.lineTo(Math.cos(end) * RING_INNER, Math.sin(end) * RING_INNER);
	shape.absarc(0, 0, RING_INNER, end, start, true);
	shape.closePath();
	return new ExtrudeGeometry(shape, {
		depth,
		bevelEnabled: false,
		steps: 1,
		curveSegments: segments,
	});
}

type RingSample = {
	position: [number, number, number];
	tangent: [number, number, number];
	matrix: Matrix4;
};

function layoutRings(curve: CatmullRomCurve3): RingSample[] {
	const count = ringCount(curve.getLength());
	const position = new Vector3();
	const tangent = new Vector3();
	const quaternion = new Quaternion();
	const scale = new Vector3(RING_SCALE, RING_SCALE, RING_SCALE);
	const axis = new Vector3(0, 0, 1);
	const rings: RingSample[] = [];
	for (let index = 0; index < count; index += 1) {
		const t = 0.02 + (index / Math.max(1, count - 1)) * 0.975;
		curve.getPoint(t, position);
		curve.getTangent(t, tangent);
		if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, -1);
		else tangent.normalize();
		// The hole's axis is local +Z. Point it along travel so the camera stays
		// in the opening. Axis-aligned rings turned into a flat wall on the bends.
		quaternion.setFromUnitVectors(axis, tangent);
		rings.push({
			position: [position.x, position.y, position.z],
			tangent: [tangent.x, tangent.y, tangent.z],
			matrix: new Matrix4().compose(
				position.clone(),
				quaternion.clone(),
				scale,
			),
		});
	}
	return rings;
}

function Tunnel({ rings }: { rings: RingSample[] }) {
	const geometry = useMemo(() => createAnnulus(1, 28, 0.16), []);
	const material = useMemo(
		() =>
			new MeshStandardMaterial({
				color: "#322b40",
				roughness: 1,
				metalness: 0,
				side: DoubleSide,
			}),
		[],
	);
	const mesh = useRef<InstancedMesh>(null);
	useEffect(
		() => () => {
			geometry.dispose();
			material.dispose();
		},
		[geometry, material],
	);
	useLayoutEffect(() => {
		const instanced = mesh.current;
		if (!instanced) return;
		for (let index = 0; index < rings.length; index += 1) {
			instanced.setMatrixAt(index, rings[index].matrix);
		}
		instanced.count = rings.length;
		instanced.instanceMatrix.needsUpdate = true;
		instanced.computeBoundingSphere();
	}, [rings]);
	return (
		<instancedMesh
			ref={mesh}
			args={[geometry, material, Math.max(1, rings.length)]}
			name="onboarding-rings"
			frustumCulled={false}
			raycast={() => null}
		/>
	);
}

function Sky({ progressRef }: { progressRef: { current: number } }) {
	const material = useMemo(() => {
		return new ShaderMaterial({
			side: BackSide,
			depthWrite: false,
			toneMapped: false,
			uniforms: {
				colorA: { value: new Color("#101828") },
				colorB: { value: new Color("#c5c4e0") },
			},
			vertexShader: `
				varying vec3 vDir;
				void main() {
					vDir = position;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				varying vec3 vDir;
				uniform vec3 colorA;
				uniform vec3 colorB;
				void main() {
					float h = normalize(vDir).y;
					float t = smoothstep(-0.25, 0.65, h);
					gl_FragColor = vec4(mix(colorB, colorA, t), 1.0);
				}
			`,
		});
	}, []);
	useEffect(() => () => material.dispose(), [material]);
	const top = useMemo(() => new Color(), []);
	const bottom = useMemo(() => new Color(), []);
	const nextTop = useMemo(() => new Color(), []);
	const nextBottom = useMemo(() => new Color(), []);
	useFrame((state) => {
		const mix = skyAt(progressRef.current);
		top.set(mix.from.top);
		nextTop.set(mix.to.top);
		bottom.set(mix.from.bottom);
		nextBottom.set(mix.to.bottom);
		const uniforms = material.uniforms;
		uniforms.colorA.value.copy(top).lerp(nextTop, mix.local);
		uniforms.colorB.value.copy(bottom).lerp(nextBottom, mix.local);
		const fog = state.scene.fog;
		if (fog instanceof Fog) fog.color.copy(uniforms.colorB.value);
	});
	return (
		<mesh scale={6000} frustumCulled={false} raycast={() => null}>
			<sphereGeometry args={[1, 28, 18]} />
			<primitive object={material} attach="material" />
		</mesh>
	);
}

const point = new Vector3();
const tangent = new Vector3();
const ahead = new Vector3();
const eye = new Vector3();
const right = new Vector3();
const worldUp = new Vector3(0, 1, 0);

function JourneyRig({
	curve,
	rings,
	journeyRef,
	progressRef,
	clockRef,
	reducedRef,
	audioRef,
	phaseRef,
	onProgress,
	onReady,
}: {
	curve: CatmullRomCurve3;
	rings: RingSample[];
	journeyRef: { current: JourneyState };
	progressRef: { current: number };
	clockRef: { current: number };
	reducedRef: { current: boolean };
	audioRef: { current: HTMLAudioElement | null };
	phaseRef: { current: "intro" | "journey" };
	onProgress: (display: number) => void;
	onReady: () => void;
}) {
	const rig = useRef<Group>(null);
	const camera = useRef<PerspectiveCameraImpl>(null);
	const rail = useRef(0);
	const ready = useRef(false);
	const planes = useMemo(
		() =>
			rings.map((ring) => ({ position: ring.position, tangent: ring.tangent })),
		[rings],
	);
	useFrame((state, raw) => {
		const journey = journeyRef.current;
		const reduced = reducedRef.current;
		const audio = audioRef.current;
		const driving =
			phaseRef.current === "journey" &&
			audio != null &&
			soundtrackDrives(audio.paused, audio.ended, audio.duration, reduced);
		let audioProgress: number | null = null;
		if (driving && audio) {
			const delta = frameDelta(raw);
			const budget =
				MAX_PROGRESS_PER_SECOND * frictionAt(journey.display) * delta;
			if (journey.pending < 0) journey.pending = 0;
			const applied = Math.min(journey.pending, budget);
			journey.pending -= applied;
			const duration = audio.duration;
			if (applied !== 0 && Number.isFinite(duration) && duration > 0) {
				audio.currentTime =
					Math.min(1, Math.max(0, audio.currentTime / duration + applied)) *
					duration;
			}
			audioProgress = trackProgress(audio.currentTime, duration);
		}
		if (
			phaseRef.current === "journey" ||
			journey.target > 0 ||
			journey.display > 0
		) {
			stepJourney(journey, raw, { reduced, audioProgress });
		}
		const display = journey.display;
		progressRef.current = display;
		clockRef.current = display * JOURNEY_SECONDS;
		curve.getPoint(display, point);
		curve.getTangent(display, tangent);
		if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, -1);
		else tangent.normalize();
		const back = eyeBackoff(
			[point.x, point.y, point.z],
			[tangent.x, tangent.y, tangent.z],
			planes,
		);
		eye.copy(point).addScaledVector(tangent, -back);
		ahead.copy(point).addScaledVector(tangent, 8);
		const beat = beatAt(display);
		const influence = beat
			? 1 - Math.min(1, Math.abs(display - beat.t) / 0.05)
			: 0;
		const railTarget = beat ? beat.side * 0.28 * influence : 0;
		rail.current +=
			(railTarget - rail.current) * (1 - Math.exp(-2.4 * frameDelta(raw)));
		right.crossVectors(worldUp, tangent);
		if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
		else right.normalize();
		eye.addScaledVector(right, rail.current);
		eye.y += 0.12;
		rig.current?.position.copy(eye);
		rig.current?.lookAt(ahead);
		const portrait = state.size.height > state.size.width;
		const fov = portrait ? 46 : 32;
		if (camera.current && camera.current.fov !== fov) {
			camera.current.fov = fov;
			camera.current.updateProjectionMatrix();
		}
		onProgress(display);
		if (!ready.current) {
			ready.current = true;
			onReady();
		}
	});
	return (
		<group ref={rig}>
			<PerspectiveCamera
				ref={camera}
				makeDefault
				fov={32}
				near={0.2}
				far={8000}
				position={[0, 0, 0]}
			/>
		</group>
	);
}

function useWoodMaterial() {
	const maps = useLoader(
		TextureLoader,
		SHELF_TEXTURES.map((path) => publicAssetUrl(path)),
	);
	return useMemo(() => {
		const [colorMap, normalMap, roughnessMap] = maps;
		colorMap.colorSpace = SRGBColorSpace;
		for (const map of maps) {
			map.wrapS = map.wrapT = RepeatWrapping;
			map.repeat.set(1.4, 1.4);
		}
		return new MeshStandardMaterial({
			map: colorMap,
			normalMap,
			roughnessMap,
			roughness: 0.86,
			metalness: 0,
			color: "#e6d3b0",
		});
	}, [maps]);
}

function shelfFrame(curve: CatmullRomCurve3, t: number, side: number) {
	const at = curve.getPoint(t);
	const forward = curve.getTangent(t);
	if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
	else forward.normalize();
	const lateral = new Vector3().crossVectors(worldUp, forward);
	if (lateral.lengthSq() < 1e-6) lateral.set(1, 0, 0);
	else lateral.normalize();
	const origin = at
		.clone()
		.addScaledVector(forward, 2.3)
		.addScaledVector(lateral, side * 1.35)
		.add(new Vector3(0, -0.16, 0));
	// arrangedBookPose leaves covers facing local +Z. Aim that back toward the path.
	const quaternion = new Quaternion().setFromUnitVectors(
		new Vector3(0, 0, 1),
		forward.clone().negate(),
	);
	return { position: origin, quaternion };
}

function ShelfLanding({
	t,
	side,
	placements,
	delays,
	curve,
	material,
	clockRef,
	reducedRef,
}: {
	t: number;
	side: number;
	placements: ReturnType<typeof planLandings>[number]["placements"];
	delays: Record<string, number>;
	curve: CatmullRomCurve3;
	material: MeshStandardMaterial;
	clockRef: { current: number };
	reducedRef: { current: boolean };
}) {
	const poses = useMemo(
		() => settlePoses(placements, delays),
		[placements, delays],
	);
	const plank = useMemo(() => plankFor(poses), [poses]);
	const frame = useMemo(() => shelfFrame(curve, t, side), [curve, side, t]);
	return (
		<group
			position={frame.position}
			quaternion={frame.quaternion}
			name="onboarding-shelf"
		>
			<mesh position={[0, plank.y, 0]} material={material} raycast={() => null}>
				<boxGeometry args={[plank.width, plank.height, plank.depth]} />
			</mesh>
			<OnboardingBooks
				placements={placements}
				delays={delays}
				clockRef={clockRef}
				reducedRef={reducedRef}
			/>
		</group>
	);
}

function Landings({
	curve,
	answers,
	clockRef,
	reducedRef,
}: {
	curve: CatmullRomCurve3;
	answers: OnboardingAnswers;
	clockRef: { current: number };
	reducedRef: { current: boolean };
}) {
	const material = useWoodMaterial();
	const landings = useMemo(() => planLandings(catalog, answers), [answers]);
	useEffect(() => () => material.dispose(), [material]);
	return (
		<>
			{landings.map((landing) => (
				<ShelfLanding
					key={landing.t}
					t={landing.t}
					side={landing.side}
					placements={landing.placements}
					delays={landing.delays}
					curve={curve}
					material={material}
					clockRef={clockRef}
					reducedRef={reducedRef}
				/>
			))}
		</>
	);
}

type Props = {
	journeyRef: { current: JourneyState };
	clockRef: { current: number };
	reducedRef: { current: boolean };
	audioRef: { current: HTMLAudioElement | null };
	phaseRef: { current: "intro" | "journey" };
	answers: OnboardingAnswers;
	onProgress: (display: number) => void;
	onReady: () => void;
};

export default function OnboardingScene(props: Props) {
	const curve = useMemo(() => createJourneyCurve(), []);
	const rings = useMemo(() => layoutRings(curve), [curve]);
	const progressRef = useRef(0);
	return (
		<>
			<color attach="background" args={["#101828"]} />
			<fog attach="fog" args={["#c5c4e0", 30, 200]} />
			<ambientLight intensity={0.64} />
			<hemisphereLight color="#f4f1ea" groundColor="#241c30" intensity={0.48} />
			<directionalLight position={[4, 8, 2]} intensity={1.15} />
			<Sky progressRef={progressRef} />
			<Tunnel rings={rings} />
			<Suspense fallback={null}>
				<Landings
					curve={curve}
					answers={props.answers}
					clockRef={props.clockRef}
					reducedRef={props.reducedRef}
				/>
			</Suspense>
			<JourneyRig
				curve={curve}
				rings={rings}
				journeyRef={props.journeyRef}
				progressRef={progressRef}
				clockRef={props.clockRef}
				reducedRef={props.reducedRef}
				audioRef={props.audioRef}
				phaseRef={props.phaseRef}
				onProgress={props.onProgress}
				onReady={props.onReady}
			/>
		</>
	);
}
