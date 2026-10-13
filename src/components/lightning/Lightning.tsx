import { Environment, Lightformer } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
	AdditiveBlending,
	CanvasTexture,
	MathUtils,
	type PointLight,
	Sprite,
	SpriteMaterial,
} from "three";
import { usePresentationStore } from "../../stores/usePresentationStore";

const INTRO_ROW_Y = [1.55, 0.55, -0.45, -1.45];

function makeFlareMaterial(color: string) {
	const canvas = document.createElement("canvas");
	canvas.width = 128;
	canvas.height = 128;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Unable to create lens flare texture");
	const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
	gradient.addColorStop(0, "rgba(255,255,255,1)");
	gradient.addColorStop(0.08, `${color}dd`);
	gradient.addColorStop(0.3, `${color}66`);
	gradient.addColorStop(1, `${color}00`);
	context.fillStyle = gradient;
	context.fillRect(0, 0, 128, 128);
	const texture = new CanvasTexture(canvas);
	return new SpriteMaterial({
		map: texture,
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
		opacity: 0,
		toneMapped: false,
	});
}

function MovingSpotlight() {
	const introTime = useRef(0);
	const flameClock = useRef(0);
	const fireLight = useRef<PointLight>(null);
	const rowLights = useRef<Array<PointLight | null>>([]);
	const flameSprites = useRef<Array<Sprite | null>>([]);
	const flameMaterials = useMemo(
		() => ["#ff541f", "#ff9b38", "#ffd27a"].map(makeFlareMaterial),
		[],
	);
	const lightShowDuration = usePresentationStore((state) => state.lightShowDuration);
	const lightShowCycles = usePresentationStore((state) => state.lightShowCycles);
	const lightPulse = usePresentationStore((state) => state.lightPulse);
	const lightFlareSize = usePresentationStore((state) => state.lightFlareSize);
	const fireIntensity = usePresentationStore((state) => state.fireIntensity);
	const fireReflection = usePresentationStore((state) => state.fireReflection);
	const fireReach = usePresentationStore((state) => state.fireReach);
	const lightShowKey = usePresentationStore((state) => state.lightShowKey);

	useEffect(() => {
		introTime.current = 0;
		flameClock.current = 0;
	}, [lightShowKey, lightShowDuration]);

	useFrame((_, delta) => {
		flameClock.current += delta;
		introTime.current = Math.min(lightShowDuration, introTime.current + delta);
		const fireTime = flameClock.current * (0.8 + lightShowCycles * 0.08);
		const flicker =
			0.86 +
			(0.1 * Math.sin(fireTime * 7.1) +
				0.06 * Math.sin(fireTime * 13.7 + 1.4) +
				0.035 * Math.sin(fireTime * 23.3)) *
				lightPulse;
		if (introTime.current < lightShowDuration) {
			const progress = introTime.current / lightShowDuration;
			const fade = MathUtils.smootherstep(progress, 0, 1) *
				(1 - MathUtils.smootherstep(progress, 0.82, 1));
			const flameHeight = 0.9 + 0.15 * Math.sin(fireTime * 5.2);
			if (fireLight.current) {
				fireLight.current.position.set(
					Math.sin(fireTime * 2.1) * 0.12,
					0.05 + flameHeight * 0.42,
					2.7 + Math.cos(fireTime * 1.7) * 0.08,
				);
				fireLight.current.intensity = 18 * fireIntensity * flicker * fade;
			}
			rowLights.current.forEach((rowLight, index) => {
				if (!rowLight) return;
				const rowPhase = fireTime * (1.1 + index * 0.08) + index * 0.7;
				rowLight.position.set(Math.sin(rowPhase) * 0.16, INTRO_ROW_Y[index], 2.4);
				rowLight.intensity = (1.8 + index * 0.14) * fireReflection * flicker * fade;
			});
			flameSprites.current.forEach((flame, index) => {
				if (!flame) return;
				const layer = index + 1;
				flame.position.set(
					Math.sin(fireTime * (2.2 + layer * 0.4)) * 0.08 * layer,
					0.35 + layer * 0.22 + Math.sin(fireTime * (4 + layer)) * 0.05,
					2.72,
				);
				flame.scale.setScalar((0.18 + layer * 0.1) * flicker * lightFlareSize);
				flame.material.opacity = (0.16 + layer * 0.08) * fireIntensity * flicker * fade;
			});
			return;
		}

		if (fireLight.current) fireLight.current.intensity = 4.5 * fireIntensity * flicker;
		rowLights.current.forEach((rowLight) => {
			if (rowLight) rowLight.intensity = 0.5 * fireReflection * flicker;
		});
		flameSprites.current.forEach((flame) => {
			if (flame) flame.material.opacity = 0.22 * fireIntensity * flicker;
		});
	});

	return (
		<group name="moving-spotlight">
			{INTRO_ROW_Y.map((rowY, index) => (
				<pointLight
					key={rowY}
					ref={(rowLight) => {
						rowLights.current[index] = rowLight;
					}}
					position={[0, rowY, 2.4]}
					color="#ff8a3d"
					intensity={0}
					distance={fireReach}
					decay={2}
				/>
			))}
			<pointLight
				ref={fireLight}
				position={[0, 0.5, 2.7]}
				color="#ff8a3d"
				intensity={0}
				distance={fireReach}
				decay={2}
			/>
			{flameMaterials.map((material, index) => (
				<sprite
					key={index}
					ref={(flame) => {
						flameSprites.current[index] = flame;
					}}
					material={material}
					position={[0, 0.45 + index * 0.2, 2.7]}
					scale={[0.2, 0.2, 0.2]}
				/>
			))}
		</group>
	);
}

export default function Lightning() {
	return (
		<group name="studio-lighting">
			<ambientLight intensity={0.3} />
			<hemisphereLight args={["#eef3ff", "#34303b", 0.7]} />
			<group name="soft-lighting">
				{/* Light the covers from above/front-left; shadows fall back and sideways. */}
				<directionalLight
					position={[-8, 10, 6]}
					color="#fff0df"
					intensity={2.6}
					castShadow
					shadow-mapSize={[1024, 1024]}
					shadow-camera-left={-10}
					shadow-camera-right={10}
					shadow-camera-top={10}
					shadow-camera-bottom={-10}
					shadow-camera-near={0.1}
					shadow-camera-far={30}
					shadow-intensity={0.85}
					shadow-radius={2}
					shadow-bias={-0.0003}
					shadow-normalBias={0.02}
				/>
				<directionalLight
					position={[4, 2, 2]}
					color="#dde9ff"
					intensity={0.8}
				/>
				<directionalLight
					position={[1, 3, 5]}
					color="#f1edff"
					intensity={0.5}
				/>
			</group>
			<MovingSpotlight />
			<Environment resolution={128} frames={1}>
				<Lightformer
					form="rect"
					position={[-3, 3, 2]}
					target={[0, 0, 0]}
					scale={[4, 5, 1]}
					color="#fff1dd"
					intensity={1.5}
				/>
				<Lightformer
					form="rect"
					position={[4, 1, 1]}
					target={[0, 0, 0]}
					scale={[2, 5, 1]}
					color="#e3edff"
					intensity={1}
				/>
				<Lightformer
					form="rect"
					position={[0, 2, 5]}
					target={[0, 0, 0]}
					scale={[5, 3, 1]}
					color="#f3efff"
					intensity={0.7}
				/>
			</Environment>
		</group>
	);
}
