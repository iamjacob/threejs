import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { type ComponentRef, useLayoutEffect, useMemo, useRef } from "react";
import { MathUtils, Vector3 } from "three";
import { useSelectedBook } from "../../stores/useBookStore";
import { useLevelStore } from "../../stores/useLevelStore";
import { tallestShelfBook } from "../shelves/Bookshelves";
import { progressionConfig } from "../shelves/progressionConfig";
import { BOOKS_SHELF_LEVEL } from "../shelves/shelfBooks";
import type { CameraView } from "./demoScenes";

function shelfFraming(
	levelIndex: number,
	aspect: number,
	bookHeight = 0,
	collection = false,
) {
	const fractions = progressionConfig.levels[levelIndex].shelves;
	const fraction = Math.max(...fractions, 0.08);
	const halfArc = Math.PI * fraction;
	const halfWidth = 8 * Math.sin(Math.min(halfArc, Math.PI / 2));
	const back = -8;
	const front = -(halfArc < Math.PI / 2 ? 7 : 8) * Math.cos(halfArc);
	const visibleShelves = fractions.flatMap((value, index) =>
		value > 0 ? [index] : [],
	);
	const bottom = (visibleShelves[0] ?? 0) - 1.8;
	const top = (visibleShelves.at(-1) ?? 3) - 1.72 + bookHeight;
	const target = new Vector3(0, (bottom + top) / 2, (back + front) / 2);
	const radius = Math.hypot(halfWidth, (top - bottom) / 2, (front - back) / 2);
	const verticalFov = MathUtils.degToRad(45);
	const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
	const distance = collection
		? Math.max(
				halfWidth / Math.tan(horizontalFov / 2),
				(top - bottom) / 2 / Math.tan(verticalFov / 2),
			) *
				1.2 +
			(front - back) / 2
		: (radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * 1.25;
	return { target, distance, fullCircle: fraction === 1 };
}

export default function DemoCamera({ view }: { view: CameraView }) {
	const book = useSelectedBook();
	const { camera, size } = useThree();
	const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
	const levelIndex = useLevelStore((state) => state.levelIndex);
	const isPlaying = useLevelStore((state) => state.isPlaying);
	const pausePlayback = useLevelStore((state) => state.pausePlayback);
	const moving = useRef(true);
	const initialized = useRef(false);
	const elapsed = useRef(0);
	const desiredPosition = useMemo(() => new Vector3(), []);
	const isCollection = view === "shelves-books";
	const isShelves = view === "shelves" || isCollection;
	const elevation = isCollection ? 0.12 : 0.5;
	const framing = useMemo(
		() =>
			shelfFraming(
				isCollection ? BOOKS_SHELF_LEVEL : levelIndex,
				size.width / size.height,
				isCollection ? tallestShelfBook : book.dimensions[1],
				isCollection,
			),
		[levelIndex, size.width, size.height, isCollection, book.dimensions],
	);

	useLayoutEffect(() => {
		const orbit = controls.current;
		if (!orbit) return;

		if (isShelves) {
			moving.current = true;
			if (!initialized.current) {
				orbit.target.copy(framing.target);
				camera.position
					.copy(framing.target)
					.add(
						new Vector3(
							0,
							framing.distance * elevation,
							framing.distance * Math.sqrt(1 - elevation ** 2),
						),
					);
			}
		} else {
			// Keep a single cover close on phones while leaving room for an open spread.
			const portraitScale = Math.max(
				1,
				(size.height / size.width) * (view === "book" ? 0.7 : 1),
			);
			const position =
				view === "page"
					? new Vector3(0.7, 0.25, 1.65)
					: view === "open-book"
						? new Vector3(1.1, 0.65, 2.8)
						: new Vector3(0.3, 0.12, 2.3);
			const bookScale = Math.max(book.dimensions[1], book.dimensions[0] / 0.7);
			camera.position.copy(position.multiplyScalar(portraitScale * bookScale));
			orbit.target.set(0, 0, 0);
		}

		initialized.current = true;
		camera.lookAt(orbit.target);
		orbit.update();
	}, [
		camera,
		framing,
		isShelves,
		view,
		size.width,
		size.height,
		elevation,
		book.dimensions,
	]);

	useFrame((_, delta) => {
		const orbit = controls.current;
		if (!orbit || !isShelves || (!isPlaying && !moving.current)) return;
		const step = Math.min(delta, 0.1);
		if (isPlaying) elapsed.current += step;
		const angle = framing.fullCircle
			? elapsed.current * 0.5
			: Math.sin(elapsed.current * 0.35) * 0.35;
		const orbitElevation = framing.fullCircle ? 0.6 : elevation;
		const horizontal = framing.distance * Math.sqrt(1 - orbitElevation ** 2);
		desiredPosition
			.set(
				Math.sin(angle) * horizontal,
				framing.distance * orbitElevation,
				Math.cos(angle) * horizontal,
			)
			.add(framing.target);

		const smoothing = 1 - Math.exp(-3 * step);
		camera.position.lerp(desiredPosition, smoothing);
		orbit.target.lerp(framing.target, smoothing);
		orbit.update();
		if (
			camera.position.distanceTo(desiredPosition) < 0.01 &&
			orbit.target.distanceTo(framing.target) < 0.01
		) {
			moving.current = false;
		}
	}, -2);

	return (
		<OrbitControls
			ref={controls}
			makeDefault
			enableDamping
			dampingFactor={0.08}
			zoomSpeed={size.width < 768 ? 0.75 : 1}
			rotateSpeed={size.width < 768 ? 0.75 : 1}
			minDistance={isShelves ? 2 : 0.6}
			maxDistance={isShelves ? 150 : 12}
			onStart={() => {
				moving.current = false;
				if (isShelves) pausePlayback();
			}}
		/>
	);
}
