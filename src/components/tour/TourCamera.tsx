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
import { useShelfControlsStore } from "../../../stores/useShelfControlsStore";
import { SHOW_DEMO_UI } from "../../lib/featureFlags";
import { useLibraryBooks, useSelectedBook } from "../../stores/useBookStore";
import { useLevelStore } from "../../stores/useLevelStore";
import { usePresentationStore } from "../../stores/usePresentationStore";
import { useTourStore } from "../../stores/useTourStore";
import { shelfFraming } from "../layout/DemoCamera";
import { shelfBookPose } from "../shelves/Bookshelves";
import {
	arrangeShelfBooks,
	frameShelfEditor,
	frameShelfSelection,
} from "../shelves/shelfArrangement";
import { focusBookPosition } from "./tourBookPose";
import { tourStages } from "./tourStages";

export default function TourCamera() {
	const { camera, size } = useThree();
	const book = useSelectedBook();
	const shelfBooks = useLibraryBooks();
	const tallestShelfBook = Math.max(
		...shelfBooks.map((entry) => entry.dimensions[1]),
	);
	const stage = useTourStore((state) => state.stage);
	const reader = useTourStore((state) => state.reader);
	const focusRevision = useTourStore((state) => state.focusRevision);
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
	const previewFrame = useMemo(
		() =>
			frameShelfSelection(
				editPlacements.filter((entry) => entry.book.id === book.id),
				Math.max(240, size.width - 72),
				size.height,
			),
		[editPlacements, book.id, size.width, size.height],
	);
	const browsingFocus = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Each explicit selection or return requests one smooth focus; orbit gestures can then take over.
	useLayoutEffect(() => {
		browsingFocus.current = true;
	}, [focusRevision, editing, book.id, size.width, size.height]);
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
				size.width < 768,
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
			// Hold the view still while aiming at another book or a gap.
			if (drag || editorGesture.current) return;
			target.copy(selectionFrame?.target ?? framing.target);
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
		if (
			(tour.bookPanel === "preview" && stage === "pick") ||
			(tour.bookPanel === "open" && stage === "read") ||
			(stage === "library" && tour.paused && tour.focusRevision > 0)
		) {
			if (!browsingFocus.current) return;
			if (stage === "library") {
				target.copy(framing.target);
				position
					.copy(target)
					.add(
						new Vector3(0, framing.distance * 0.12, framing.distance * 0.993),
					);
			} else {
				const distance =
					stage === "read"
						? 2.6 * Math.max(1, (size.height / size.width) * 0.9) * bookScale
						: (previewFrame?.distance ?? 3.2);
				if (stage === "read") target.set(...focusBookPosition(book.id));
				else target.copy(previewFrame?.target ?? framing.target);
				// Balance the top details and bottom helix, leaving room for right-side actions.
				target.y -=
					distance * Math.tan(Math.PI / 8) * Math.min(0.16, 70 / size.height);
				target.x += distance * Math.tan(Math.PI / 8) * (56 / size.height);
				position.copy(target).add(new Vector3(0, distance * 0.06, distance));
			}
			const smoothing = reducedMotion
				? 1
				: 1 - Math.exp(-Math.min(delta, 0.1) * 5);
			camera.position.lerp(position, smoothing);
			orbit.target.lerp(target, smoothing);
			orbit.update();
			if (
				camera.position.distanceTo(position) < 0.01 &&
				orbit.target.distanceTo(target) < 0.01
			)
				browsingFocus.current = false;
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
			if (tour.bookPanel === "open") {
				target.y -=
					radius * Math.tan(Math.PI / 8) * Math.min(0.16, 70 / size.height);
				target.x += radius * Math.tan(Math.PI / 8) * (56 / size.height);
			}
			const angle = stage === "read" ? Math.sin(tour.elapsed * 0.24) * 0.4 : 0;
			position.set(
				Math.sin(angle) * radius,
				radius * (tour.bookPanel === "open" ? 0.06 : 0.18),
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
			enabled={
				!userAddition &&
				!drag &&
				reader === "closed" &&
				stage !== "pull" &&
				stage !== "return"
			}
			enableRotate={!editing}
			enablePan={!editing}
			enableZoom={!drag}
			enableDamping
			dampingFactor={0.08}
			zoomSpeed={0.75}
			minDistance={shelves ? 2 : bookScale * 0.6}
			maxDistance={shelves ? 150 : 15}
			onStart={() => {
				browsingFocus.current = false;
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
