import { useFrame, useLoader } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useLevelStore } from "../../stores/useLevelStore";
import { progressionConfig } from "./progressionConfig";

type Vector3Tuple = [number, number, number];

interface ShelfProps {
	position?: Vector3Tuple;
	rotation?: Vector3Tuple;
	fraction: number;
	index: number;
}

const Shelf = ({
	position = [0, 0, 0],
	rotation = [-Math.PI / 2, 0, 0],
	fraction,
	index,
}: ShelfProps) => {
	const meshRef = useRef<THREE.Mesh>(null);
	// const { zoomToShelf } = useShelfZoomStore();

	const textures = useLoader(THREE.TextureLoader, [
		"/experience/shelf/Wood051_1K-JPG_Color.webp",
		"/experience/shelf/Wood051_1K-JPG_NormalGL.webp",
		"/experience/shelf/Wood051_1K-JPG_Roughness.webp",
	]);

	const [colorMap, normalMap, roughnessMap] = useMemo(() => {
		textures[0].colorSpace = THREE.SRGBColorSpace;
		textures.forEach((map) => {
			map.wrapS = map.wrapT = THREE.RepeatWrapping;
			map.repeat.set(1, 1);
		});

		return textures;
	}, [textures]);

	const geometry = useMemo(() => {
		const outerR = 8;
		const innerR = 7;
		const arcLength = Math.PI * 2 * fraction;
		const startAngle = -arcLength / 2; // Center the arc
		const endAngle = arcLength / 2;

		const shape = new THREE.Shape();

		shape.moveTo(Math.cos(startAngle) * outerR, Math.sin(startAngle) * outerR);

		shape.absarc(0, 0, outerR, startAngle, endAngle, false);

		shape.lineTo(Math.cos(endAngle) * innerR, Math.sin(endAngle) * innerR);

		shape.absarc(0, 0, innerR, endAngle, startAngle, true);
		shape.closePath();

		return new THREE.ExtrudeGeometry(shape, {
			depth: 0.08,
			bevelEnabled: false,
			steps: 1,
			curveSegments: 32,
		});
	}, [fraction]);

	useEffect(() => () => geometry.dispose(), [geometry]);

	return (
		<group
			position={position}
			rotation={rotation}
			name={`shelf-group-${index}`}
		>
			{/* Visible shelf */}
			<mesh
				ref={meshRef}
				raycast={() => null}
				// onDoubleClick={() => toggle()}
			>
				<primitive object={geometry} attach="geometry" />

				<meshStandardMaterial
					map={colorMap}
					normalMap={normalMap}
					roughnessMap={roughnessMap}
					side={THREE.DoubleSide}
				/>
			</mesh>
		</group>
	);
};

const Shelves = () => {
	const levelIndex = useLevelStore((state) => state.levelIndex);
	const isPlaying = useLevelStore((state) => state.isPlaying);
	const advanceLevel = useLevelStore((state) => state.advanceLevel);
	const playback = useRef({ levelIndex, isPlaying, elapsed: 0 });
	const targetFractions = progressionConfig.levels[levelIndex]?.shelves ?? [];
	const [animatedFractions, setAnimatedFractions] =
		useState<number[]>(targetFractions);
	const fractionsRef = useRef(animatedFractions);

	useFrame((_, delta) => {
		if (
			playback.current.levelIndex !== levelIndex ||
			playback.current.isPlaying !== isPlaying
		) {
			playback.current = { levelIndex, isPlaying, elapsed: 0 };
		}
		if (!isPlaying) return;
		playback.current.elapsed += Math.min(delta, 0.1);
		const duration =
			levelIndex === progressionConfig.levels.length - 1 ? 14 : 3;
		if (playback.current.elapsed >= duration) {
			playback.current.elapsed = 0;
			advanceLevel();
		}
	});

	useEffect(() => {
		const tweens: { value: number }[] = [];

		targetFractions.forEach((targetFraction, index) => {
			const tweenState = {
				value: fractionsRef.current[index] ?? 0,
			};
			tweens.push(tweenState);

			gsap.to(tweenState, {
				value: targetFraction,
				duration: 0.45,
				delay: index * 0.06,
				ease: "power1.out",
				onUpdate: () => {
					setAnimatedFractions((current) => {
						const next = [...current];
						next[index] = tweenState.value;
						fractionsRef.current = next;
						return next;
					});
				},
			});
		});

		return () => {
			tweens.forEach((tweenState) => {
				gsap.killTweensOf(tweenState);
			});
		};
	}, [targetFractions]);

	return (
		<group position={[0, -0.8, 0]} rotation={[0, Math.PI / 2, 0]}>
			{animatedFractions.map((fraction, i) => {
				if (fraction <= 0.0001) return null;

				return (
					<Shelf
						// biome-ignore lint/suspicious/noArrayIndexKey: Each index is a fixed shelf position across levels.
						key={i}
						index={i}
						position={[0, i - 1, 0]}
						fraction={fraction}
					/>
				);
			})}
		</group>
	);
};

export default Shelves;
