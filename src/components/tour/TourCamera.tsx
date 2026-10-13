import { useShelfControlsStore } from "../../../stores/useShelfControlsStore";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
	type ComponentRef,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { MathUtils, Vector3 } from "three";
import { useLibraryBooks, useSelectedBook } from "../../stores/useBookStore";
import { useLevelStore } from "../../stores/useLevelStore";
import { usePresentationStore } from "../../stores/usePresentationStore";
import { useTourStore } from "../../stores/useTourStore";
import { shelfFraming } from "../layout/DemoCamera";
import {
	arrangeShelfBooks,
	frameShelfSelection,
	frameShelfEditor,
} from "../shelves/shelfArrangement";
import { shelfBookPose } from "../shelves/Bookshelves";
import { focusBookPosition } from "./tourBookPose";
import { tourStages } from "./tourStages";
import { SHOW_DEMO_UI } from "../../lib/featureFlags";

export default function TourCamera() {
	const { camera, size } = useThree();
	const book = useSelectedBook();
	const shelfBooks = useLibraryBooks();
	const tallestShelfBook = Math.max(
		...shelfBooks.map((entry) => entry.dimensions[1]),
	);
	const stage = useTourStore((state) => state.stage);
	const userAddition = useTourStore((state) => state.userAddition);
	const arrivalFrame = useMemo(
		() =>
			userAddition
				? frameShelfSelection(
						arrangeShelfBooks(
							shelfBooks,
							useShelfControlsStore.getState().document,
						).filter((entry) => entry.book.id === book.id),
						size.width,
						size.height,
					)
				: null,
		[userAddition, shelfBooks, book.id, size.width, size.height],
	);
	const level = useLevelStore((state) => state.levelIndex);
	const cameraMode = usePresentationStore((state) => state.cameraMode);
	const editing = useShelfControlsStore((state) => state.editing);
	const shelfDocument = useShelfControlsStore((state) => state.document);
	const selectedIds = useShelfControlsStore((state) => state.selectedIds);
	const zoomMode = useShelfControlsStore((state) => state.zoomMode);
	const drag = useShelfControlsStore((state) => state.drag);
	const editPlacements = useMemo(
		() => arrangeShelfBooks(shelfBooks, shelfDocument),
		[shelfBooks, shelfDocument],
	);
	const selectionFrame = useMemo(
		() =>
			editing
				? frameShelfEditor(
						editPlacements,
						selectedIds,
						zoomMode,
						size.width,
						size.height,
						drag?.drop.shelf,
					)
				: null,
		[
			editing,
			editPlacements,
			selectedIds,
			zoomMode,
			size.width,
			size.height,
			drag?.drop.shelf,
		],
	);
	const shelfView = useShelfControlsStore((state) => state.shelfView);
	const viewRevision = useShelfControlsStore((state) => state.viewRevision);
	const editorGesture = useRef(false);
	const editorZoomScale = useRef(1);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Refocus only when the chosen book, view, or viewport changes.
	useEffect(() => {
		editorGesture.current = false;
		if (!useShelfControlsStore.getState().drag) editorZoomScale.current = 1;
	}, [editing, viewRevision, selectedIds, size.width, size.height]);
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
		[
			collection,
			level,
			size.width,
			size.height,
			book.dimensions,
			tallestShelfBook,
		],
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
		if (editing && (stage === "library" || stage === "pick")) {
			if (editorGesture.current && !drag) return;
			target.copy(selectionFrame?.target ?? framing.target);
			if (drag && zoomMode === "book") target.add(new Vector3(...drag.offset));
			const angle = shelfView === "threeQuarter" ? 0.35 : 0;
			const elevation =
				shelfView === "top" ? 0.62 : shelfView === "threeQuarter" ? 0.2 : 0.055;
			const distance =
				(selectionFrame?.distance ?? framing.distance) *
				(shelfView === "front" ? 1 : 1.08) *
				editorZoomScale.current;
			// Center the chosen book in the workspace above the compact dock.
			target.y -= selectionFrame
				? distance * Math.tan(Math.PI / 8) * 0.16
				: size.width < 700
					? 0.4
					: 0.55;
			const radius = distance * Math.sqrt(1 - elevation ** 2);
			position
				.set(
					Math.sin(angle) * radius,
					distance * elevation,
					Math.cos(angle) * radius,
				)
				.add(target);
			const smoothing = reducedMotion
				? 1
				: 1 - Math.exp(-Math.min(delta, 0.1) * (drag ? 4 : 6));
			camera.position.lerp(position, smoothing);
			orbit.target.lerp(target, smoothing);
			orbit.update();
			return;
		}
		if (tour.paused) return;
		if (tour.userAddition && arrivalFrame) {
			target.copy(arrivalFrame.target);
			position
				.copy(target)
				.add(new Vector3(0, 0.12, Math.max(3.2, arrivalFrame.distance)));
			const smoothing = reducedMotion
				? 1
				: 1 - Math.exp(-Math.min(delta, 0.1) * 5);
			camera.position.lerp(position, smoothing);
			orbit.target.lerp(target, smoothing);
			orbit.update();
			return;
		}
		const introDuration = tourStages.library.duration ?? 7;
		const introOrbit =
			SHOW_DEMO_UI &&
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
			enabled={!userAddition}
			enableRotate={!editing}
			enablePan={!editing}
			enableZoom={!drag}
			enableDamping
			dampingFactor={0.08}
			zoomSpeed={0.75}
			minDistance={shelves ? 2 : bookScale * 0.6}
			maxDistance={shelves ? 150 : 15}
			onStart={() => {
				if (editing) editorGesture.current = true;
				useTourStore.setState({ paused: true });
			}}
			onEnd={() => {
				const orbit = controls.current;
				if (editing && orbit && editorGesture.current) {
					const distance =
						(selectionFrame?.distance ?? framing.distance) *
						(shelfView === "front" ? 1 : 1.08);
					editorZoomScale.current = MathUtils.clamp(
						camera.position.distanceTo(orbit.target) / distance,
						0.55,
						3,
					);
				}
				editorGesture.current = false;
			}}
		/>
	);
}
