import { useFrame, useLoader } from "@react-three/fiber";
import gsap from "gsap";
import {
	type ReactNode,
	Suspense,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import * as THREE from "three";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useSelectedBook } from "../../stores/useBookStore";
import { useLevelStore } from "../../stores/useLevelStore";
import Book from "../book/book";
import { progressionConfig } from "./progressionConfig";
import {
	SHELF_INNER_RADIUS,
	SHELF_SPACING,
	SHELF_THICKNESS,
} from "./shelfBooks";

type Vector3Tuple = [number, number, number];

interface ShelfProps {
	position?: Vector3Tuple;
	rotation?: Vector3Tuple;
	fraction: number;
	index: number;
	radius: number;
}

const SHELF_TEXTURES = [
	"/experience/shelf/Wood051_1K-JPG_Color.webp",
	"/experience/shelf/Wood051_1K-JPG_NormalGL.webp",
	"/experience/shelf/Wood051_1K-JPG_Roughness.webp",
];
useLoader.preload(
	THREE.TextureLoader,
	SHELF_TEXTURES.map((url) => publicAssetUrl(url)),
);

const Shelf = ({
	position = [0, 0, 0],
	rotation = [-Math.PI / 2, 0, 0],
	fraction,
	index,
	radius,
}: ShelfProps) => {
	const meshRef = useRef<THREE.Mesh>(null);
	// const { zoomToShelf } = useShelfZoomStore();

	const textures = useLoader(
		THREE.TextureLoader,
		SHELF_TEXTURES.map((url) => publicAssetUrl(url)),
	);

	const [colorMap, normalMap, roughnessMap] = useMemo(() => {
		textures[0].colorSpace = THREE.SRGBColorSpace;
		textures.forEach((map) => {
			map.wrapS = map.wrapT = THREE.RepeatWrapping;
			map.repeat.set(1, 1);
		});

		return textures;
	}, [textures]);

	const geometry = useMemo(() => {
		const outerR = radius + 0.6;
		const innerR = radius - 0.4;
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
			depth: SHELF_THICKNESS,
			bevelEnabled: false,
			steps: 1,
			curveSegments: 32,
		});
	}, [fraction, radius]);

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
				castShadow
				receiveShadow
				raycast={() => null}
				// onDoubleClick={() => toggle()}
			>
				<primitive object={geometry} attach="geometry" />

				<meshStandardMaterial
					map={colorMap}
					normalMap={normalMap}
					roughnessMap={roughnessMap}
					side={THREE.DoubleSide}
					shadowSide={THREE.BackSide}
				/>
			</mesh>
		</group>
	);
};

const Shelves = ({
	fixedLevel,
	arcFraction,
	radius = SHELF_INNER_RADIUS + 0.4,
	children,
}: {
	fixedLevel?: number;
	/** Overrides the level's arc so shelves can grow with the library. */
	arcFraction?: number;
	radius?: number;
	children?: ReactNode;
}) => {
	const book = useSelectedBook();
	const levelIndex = useLevelStore((state) => fixedLevel ?? state.levelIndex);
	const isPlaying = useLevelStore(
		(state) => fixedLevel === undefined && state.isPlaying,
	);
	const advanceLevel = useLevelStore((state) => state.advanceLevel);
	const playback = useRef({ levelIndex, isPlaying, elapsed: 0 });
	const levelFractions = progressionConfig.levels[levelIndex]?.shelves ?? [];
	const targetFractions = useMemo(
		() =>
			arcFraction === undefined
				? levelFractions
				: levelFractions.map((fraction) => (fraction > 0 ? arcFraction : 0)),
		[levelFractions, arcFraction],
	);
	const bookShelfIndex = targetFractions.findIndex((fraction) => fraction > 0);
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
						radius={radius}
						position={[0, (i - 1) * SHELF_SPACING, 0]}
						fraction={fraction}
					/>
				);
			})}
			{children ??
				(bookShelfIndex >= 0 && (
					<group
						position={[
							SHELF_INNER_RADIUS + 0.4,
							(bookShelfIndex - 1) * SHELF_SPACING +
								SHELF_THICKNESS +
								book.dimensions[1] / 2,
							0,
						]}
						rotation={[0, -Math.PI / 2, 0]}
					>
						<Suspense fallback={null}>
							<Book />
						</Suspense>
					</group>
				))}
		</group>
	);
};

export default Shelves;
