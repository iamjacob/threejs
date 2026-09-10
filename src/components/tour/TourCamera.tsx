import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { type ComponentRef, useLayoutEffect, useMemo, useRef } from "react";
import { MathUtils, Vector3 } from "three";
import { useSelectedBook } from "../../stores/useBookStore";
import { useLevelStore } from "../../stores/useLevelStore";
import { useTourStore } from "../../stores/useTourStore";
import { shelfFraming } from "../layout/DemoCamera";
import { tallestShelfBook } from "../shelves/Bookshelves";
import { focusBookPosition } from "./tourBookPose";

export default function TourCamera() {
	const { camera, size } = useThree();
	const book = useSelectedBook();
	const stage = useTourStore((state) => state.stage);
	const level = useLevelStore((state) => state.levelIndex);
	const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
	const initialized = useRef(false);
	const startPosition = useMemo(() => new Vector3(), []);
	const startTarget = useMemo(() => new Vector3(), []);
	const target = useMemo(() => new Vector3(), []);
	const position = useMemo(() => new Vector3(), []);
	const collection =
		stage === "library" ||
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
		if (shelves) {
			target.copy(framing.target);
			const angle = framing.fullCircle
				? tour.elapsed * 0.22
				: Math.sin(tour.elapsed * 0.18) * 0.075;
			const elevation = framing.fullCircle ? 0.5 : 0.12;
			const radius = framing.distance * Math.sqrt(1 - elevation ** 2);
			position
				.set(
					Math.sin(angle) * radius,
					framing.distance * elevation,
					Math.cos(angle) * radius,
				)
				.add(target);
		} else {
			const focus =
				stage === "read" || stage === "pull"
					? focusBookPosition(book.id)
					: [0, 0, 0];
			target.set(focus[0], focus[1], focus[2]);
			const portrait = Math.max(
				1,
				(size.height / size.width) * (stage === "read" ? 0.9 : 0.75),
			);
			position
				.set(
					stage === "read" ? 0.5 : 0.2,
					stage === "read" ? 0.38 : 0.12,
					stage === "read" ? 2.6 : 2.25,
				)
				.multiplyScalar(portrait * bookScale);
			position.x += Math.sin(tour.elapsed * 0.2) * bookScale * 0.07;
			if (stage === "read") {
				const radius = 2.6 * portrait * bookScale;
				const angle = Math.sin(tour.elapsed * 0.24) * 0.4;
				position.set(
					Math.sin(angle) * radius,
					radius * 0.18,
					Math.cos(angle) * radius,
				);
			}
			position.add(target);
		}
		if (stage === "pull" || stage === "return") {
			const t = MathUtils.smoothstep(
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
