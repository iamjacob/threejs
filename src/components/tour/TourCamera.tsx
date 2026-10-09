import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { type ComponentRef, useLayoutEffect, useMemo, useRef } from "react";
import { MathUtils, Vector3 } from "three";
import { useSelectedBook } from "../../stores/useBookStore";
import { useLevelStore } from "../../stores/useLevelStore";
import { usePresentationStore } from "../../stores/usePresentationStore";
import { useTourStore } from "../../stores/useTourStore";
import { shelfFraming } from "../layout/DemoCamera";
import { shelfBookPose, tallestShelfBook } from "../shelves/Bookshelves";
import { focusBookPosition } from "./tourBookPose";
import { tourStages } from "./tourStages";

export default function TourCamera() {
	const { camera, size } = useThree();
	const book = useSelectedBook();
	const stage = useTourStore((state) => state.stage);
	const level = useLevelStore((state) => state.levelIndex);
	const cameraMode = usePresentationStore((state) => state.cameraMode);
	const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
	const initialized = useRef(false);
	const reducedMotion = useMemo(
		() => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		[],
	);
	const startPosition = useMemo(() => new Vector3(), []);
	const startTarget = useMemo(() => new Vector3(), []);
	const target = useMemo(() => new Vector3(), []);
	const position = useMemo(() => new Vector3(), []);
	const collection =
		stage === "library" ||
		stage === "pick" ||
		stage === "delete" ||
		stage === "return" ||
		stage === "end" ||
		stage === "privacy" ||
		stage === "add";
	const shelves = collection || stage === "grow";
	const framing = useMemo(
		() =>
			shelfFraming(
				collection ? 4 : level,
				size.width / size.height,
				collection ? tallestShelfBook : book.dimensions[1],
				collection,
			),
		[collection, level, size.width, size.height, book.dimensions],
	);
	const bookScale = Math.max(book.dimensions[1], book.dimensions[0] / 0.7);

	useLayoutEffect(() => {
		const orbit = controls.current;
		if (!orbit) return;
		if (!initialized.current) {
			orbit.target.copy(framing.target);
			camera.position
				.copy(framing.target)
				.add(new Vector3(0, framing.distance * 0.12, framing.distance * 0.993));
			initialized.current = true;
		}
		if (stage === "pull" || stage === "return") {
			startPosition.copy(camera.position);
			startTarget.copy(orbit.target);
		}
	}, [stage, camera, framing, startPosition, startTarget]);

	useFrame((_, delta) => {
		const orbit = controls.current;
		const tour = useTourStore.getState();
		if (!orbit || !tour.ready || tour.reader === "open") return;
		if (tour.reader === "zooming") {
			const focus = focusBookPosition(book.id);
			target.set(...focus);
			const portrait = Math.max(1, (size.height / size.width) * 0.9);
			position
				.set(0, 0.12, 1.65)
				.multiplyScalar(portrait * bookScale)
				.add(target);
			const smoothing = 1 - Math.exp(-Math.min(delta, 0.1) * 5);
			camera.position.lerp(position, smoothing);
			orbit.target.lerp(target, smoothing);
			orbit.update();
			if (camera.position.distanceTo(position) < 0.015)
				useTourStore.setState({ reader: "open" });
			return;
		}
		if (tour.paused) return;
		const introDuration = tourStages.library.duration ?? 7;
		const introOrbit =
			stage === "library" &&
			tour.elapsed >= introDuration - 2 &&
			!reducedMotion;
		if (shelves) {
			const focusSelectedBook =
				cameraMode === "focus" ||
				cameraMode === "book" ||
				stage === "pick" ||
				stage === "end";
			if (focusSelectedBook) {
				if (cameraMode === "book") target.set(...focusBookPosition(book.id));
				else {
					const selectedShelfBook = shelfBookPose(book.id);
					target.set(...selectedShelfBook.position);
				}
			} else {
				target.copy(framing.target);
			}
			const angle = introOrbit
				? MathUtils.smootherstep(
						(tour.elapsed - (introDuration - 2)) / 2,
						0,
						1,
					) *
					Math.PI *
					2
				: framing.fullCircle
					? tour.elapsed * 0.22
					: stage === "library"
						? 0
						: Math.sin(tour.elapsed * 0.18) * 0.075;
			const elevation = introOrbit
				? 0.12 + Math.sin(angle / 2) * 0.16
				: framing.fullCircle
					? 0.5
					: 0.12;
			// Pull back at the sides so the curved shelf stays inside the view.
			const distance = focusSelectedBook
				? cameraMode === "book"
					? 2.6 * Math.max(1, (size.height / size.width) * 0.9) * bookScale
					: Math.max(bookScale * 2.8, 2.8)
				: framing.distance *
					  (introOrbit ? 1 + Math.sin(angle / 2) ** 2 * 0.2 : 1);
			const radius = distance * Math.sqrt(1 - elevation ** 2);
			position
				.set(
					Math.sin(angle) * radius,
					distance * elevation,
					Math.cos(angle) * radius,
				)
				.add(target);
		} else {
			const focus = focusBookPosition(book.id);
			target.set(...focus);
			// Arrive at the same framing that starts the reading orbit.
			const portrait = Math.max(1, (size.height / size.width) * 0.9);
			const radius = 2.6 * portrait * bookScale;
			const angle = stage === "read" ? Math.sin(tour.elapsed * 0.24) * 0.4 : 0;
			position.set(
				Math.sin(angle) * radius,
				radius * 0.18,
				Math.cos(angle) * radius,
			);
			position.add(target);
		}
		if (introOrbit) {
			// Follow the arc directly; lerping positions would cut through the shelf.
			camera.position.copy(position);
			orbit.target.copy(target);
		} else if (stage === "pull" || stage === "return") {
			const t = MathUtils.smootherstep(
				tour.elapsed / (stage === "return" ? 1.8 : 2),
				0,
				1,
			);
			camera.position.lerpVectors(startPosition, position, t);
			orbit.target.lerpVectors(startTarget, target, t);
		} else {
			const smoothing = 1 - Math.exp(-Math.min(delta, 0.1) * 3);
			camera.position.lerp(position, smoothing);
			orbit.target.lerp(target, smoothing);
		}
		orbit.update();
	}, -1);
	return (
		<OrbitControls
			ref={controls}
			makeDefault
			enableDamping
			dampingFactor={0.08}
			zoomSpeed={0.75}
			minDistance={shelves ? 2 : bookScale * 0.6}
			maxDistance={shelves ? 150 : 15}
			onStart={() => useTourStore.setState({ paused: true })}
		/>
	);
}
