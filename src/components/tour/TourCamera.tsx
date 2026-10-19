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
import { useFeatureFlags } from "../../lib/featureFlags";
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
import {
	currentShelfArcFraction,
	useShelfArcFraction,
} from "../shelves/useShelfArc";
import { pointerTurnSpeed, stepCenterTurn } from "./centerCamera";
import {
	getControllerJoystick,
	getControllerJoystickMode,
} from "./controllerJoystick";
import {
	LIBRARY_ENTRANCE_SECONDS,
	libraryEntrancePose,
} from "./libraryEntrance";
import { focusBookPosition } from "./tourBookPose";
import { tourStages } from "./tourStages";

export default function TourCamera() {
	const { SHOW_DEMO_UI } = useFeatureFlags();
	const { camera, size, gl } = useThree();
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
							currentShelfArcFraction(),
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
	const arcFraction = useShelfArcFraction();
	const editPlacements = useMemo(
		() => arrangeShelfBooks(shelfBooks, shelfDocument, arcFraction),
		[shelfBooks, shelfDocument, arcFraction],
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
	const readShot = useRef<{
		elapsed: number;
		position: Vector3;
		target: Vector3;
	} | null>(null);
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
	const dragView = useRef<{ target: Vector3; offset: Vector3 } | null>(null);
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
	const entrance = useRef({ elapsed: 0, done: reducedMotion });
	useEffect(() => {
		// Any interaction hands camera control to the reader immediately.
		const cancel = () => {
			entrance.current.done = true;
		};
		window.addEventListener("pointerdown", cancel, true);
		window.addEventListener("wheel", cancel, { passive: true, capture: true });
		window.addEventListener("keydown", cancel, true);
		return () => {
			window.removeEventListener("pointerdown", cancel, true);
			window.removeEventListener("wheel", cancel, true);
			window.removeEventListener("keydown", cancel, true);
		};
	}, []);
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
				collection ? arcFraction : undefined,
			),
		[
			arcFraction,
			collection,
			level,
			size.width,
			size.height,
			book.dimensions,
			tallestShelfBook,
		],
	);
	const bookScale = Math.max(book.dimensions[1], book.dimensions[0] / 0.7);
	const libraryLevel = useLevelStore((state) => state.libraryLevel);
	const centered =
		reader === "closed" &&
		!userAddition &&
		libraryLevel === 10 &&
		["library", "pick", "end", "grow"].includes(stage);
	const centeredRef = useRef(centered);
	centeredRef.current = centered;
	const centerTurn = useRef({
		yaw: 0,
		speed: 0,
		wanted: 0,
		pitch: 0,
		dragging: false,
		x: 0,
		y: 0,
		fov: 45,
	});
	useEffect(() => {
		if (editing)
			centerTurn.current.fov =
				zoomMode === "book" ? 28 : zoomMode === "shelf" ? 42 : 55;
	}, [editing, zoomMode]);

	useEffect(() => {
		const canvas = gl.domElement;
		const move = (event: PointerEvent) => {
			if (!centeredRef.current) return;
			const state = centerTurn.current;
			if (
				event.pointerType === "touch" &&
				state.dragging &&
				!useShelfControlsStore.getState().drag
			) {
				state.yaw -= (event.clientX - state.x) * 0.004;
				state.pitch = MathUtils.clamp(
					state.pitch + (event.clientY - state.y) * 0.002,
					-0.35,
					0.35,
				);
			}
			state.x = event.clientX;
			state.y = event.clientY;
			const rect = canvas.getBoundingClientRect();
			state.wanted =
				event.pointerType === "mouse" && !event.buttons && !reducedMotion
					? pointerTurnSpeed(((event.clientX - rect.left) / rect.width) * 2 - 1)
					: 0;
		};
		const down = (event: PointerEvent) => {
			const state = centerTurn.current;
			state.dragging = true;
			state.x = event.clientX;
			state.y = event.clientY;
			state.wanted = 0;
			state.speed = 0;
		};
		const up = () => {
			centerTurn.current.dragging = false;
		};
		const stop = () => {
			centerTurn.current.wanted = 0;
		};
		const wheel = (event: WheelEvent) => {
			if (!centeredRef.current) return;
			event.preventDefault();
			centerTurn.current.fov = MathUtils.clamp(
				centerTurn.current.fov + event.deltaY * 0.025,
				24,
				70,
			);
		};
		const key = (event: KeyboardEvent) => {
			if (!centeredRef.current || document.activeElement !== canvas) return;
			if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
				event.preventDefault();
				centerTurn.current.yaw += (event.key === "ArrowRight" ? 1 : -1) * 0.15;
			}
		};
		const previousTabIndex = canvas.getAttribute("tabindex");
		canvas.tabIndex = 0;
		canvas.addEventListener("pointermove", move);
		canvas.addEventListener("pointerdown", down);
		canvas.addEventListener("pointerleave", stop);
		canvas.addEventListener("wheel", wheel, { passive: false });
		canvas.addEventListener("keydown", key);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
		window.addEventListener("blur", stop);
		return () => {
			canvas.removeEventListener("pointermove", move);
			canvas.removeEventListener("pointerdown", down);
			canvas.removeEventListener("pointerleave", stop);
			canvas.removeEventListener("wheel", wheel);
			canvas.removeEventListener("keydown", key);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
			window.removeEventListener("blur", stop);
			if (previousTabIndex === null) canvas.removeAttribute("tabindex");
			else canvas.setAttribute("tabindex", previousTabIndex);
		};
	}, [gl, reducedMotion]);
	useLayoutEffect(() => {
		if (!centered) {
			centerTurn.current.wanted = 0;
			centerTurn.current.speed = 0;
			camera.up.set(0, 1, 0);
			if ("fov" in camera) {
				camera.fov = 45;
				camera.updateProjectionMatrix();
			}
			return;
		}
		entrance.current.done = true;
	}, [centered, camera]);

	useLayoutEffect(() => {
		const orbit = controls.current;
		if (!orbit) return;
		if (!initialized.current) {
			orbit.target.copy(framing.target);
			camera.position
				.copy(framing.target)
				.add(new Vector3(0, framing.distance * 0.12, framing.distance * 0.993));
			if (!entrance.current.done && stage === "library") {
				const pose = libraryEntrancePose(framing.target, framing.distance, 0);
				camera.position.copy(pose.position);
				orbit.target.copy(pose.target);
			}
			if (centered) {
				camera.position.set(0, 0.25, 0);
				orbit.target.set(0, 0.25, -7.4);
				entrance.current.done = true;
			}
			orbit.update();
			initialized.current = true;
		}
		if (stage === "pull" || stage === "return") {
			startPosition.copy(camera.position);
			startTarget.copy(orbit.target);
		}
	}, [stage, camera, framing, startPosition, startTarget, centered]);

	useFrame((_, delta) => {
		const orbit = controls.current;
		const tour = useTourStore.getState();
		if (!drag) dragView.current = null;
		if (!orbit || !tour.ready || tour.reader === "open") return;
		const controller = getControllerJoystick();
		const joystickMode = getControllerJoystickMode();
		if (
			!centered &&
			controller.mag > 0 &&
			reader === "closed" &&
			!editing &&
			!drag &&
			["library", "pick", "end"].includes(stage)
		) {
			useTourStore.setState({ paused: true });
			const offset = camera.position.sub(orbit.target);
			offset.applyAxisAngle(new Vector3(0, 1, 0), -controller.x * delta * 1.8);
			if (joystickMode === "zoom") {
				// Push forward to move in, pull back to move out.
				const length = MathUtils.clamp(
					offset.length() * (1 - controller.y * delta * 1.4),
					orbit.minDistance,
					orbit.maxDistance,
				);
				offset.setLength(length);
			} else {
				const right = new Vector3().crossVectors(offset, camera.up).normalize();
				offset.applyAxisAngle(right, controller.y * delta * 1.2);
			}
			camera.position.copy(orbit.target).add(offset);
			orbit.update();
			return;
		}
		if (centered) {
			const state = centerTurn.current;
			if (controller.mag > 0) {
				useTourStore.setState({ paused: true });
				// Point the camera: x spins the room, y tilts it (look) or
				// zooms the lens (zoom) — both accumulate so the view stays put.
				state.wanted = controller.x * 0.65;
				if (joystickMode === "zoom") {
					state.fov = MathUtils.clamp(
						state.fov - controller.y * delta * 38,
						24,
						70,
					);
				} else {
					state.pitch = MathUtils.clamp(
						state.pitch + controller.y * delta * 0.9,
						-0.4,
						0.4,
					);
				}
			} else if (!state.dragging) state.wanted = 0;
			const frozen =
				Boolean(drag) ||
				state.dragging ||
				document.hidden ||
				Boolean(document.querySelector("dialog[open]"));
			const next = stepCenterTurn(
				state.yaw,
				frozen ? 0 : state.speed,
				frozen ? 0 : state.wanted,
				delta,
			);
			state.yaw = next.yaw;
			state.speed = next.speed;
			const ease = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 0.05) * 5);
			// Dolly home after reading, then rotate in place. No orbit around the book.
			camera.position.lerp(position.set(0, 0.25, 0), ease);
			if (camera.position.distanceTo(position) < 0.001)
				camera.position.copy(position);
			target.set(
				Math.sin(state.yaw) * 7.4,
				0.25 + Math.sin(state.pitch) * 7.4,
				-Math.cos(state.yaw) * 7.4,
			);
			orbit.target.copy(target);
			const bank = reducedMotion ? 0 : -state.speed * 0.018;
			camera.up
				.set(Math.cos(state.yaw) * bank, 1, Math.sin(state.yaw) * bank)
				.normalize();
			if ("fov" in camera && typeof camera.fov === "number") {
				camera.fov += (state.fov - camera.fov) * ease;
				camera.updateProjectionMatrix();
			}
			orbit.update();
			return;
		}

		if (!entrance.current.done) {
			if (
				stage !== "library" ||
				editing ||
				tour.reader !== "closed" ||
				tour.bookPanel !== "closed"
			) {
				entrance.current.done = true;
			} else {
				if (document.hidden) return;
				entrance.current.elapsed += Math.min(delta, 0.1);
				const pose = libraryEntrancePose(
					framing.target,
					framing.distance,
					entrance.current.elapsed,
				);
				camera.position.copy(pose.position);
				orbit.target.copy(pose.target);
				orbit.update();
				entrance.current.done =
					entrance.current.elapsed >= LIBRARY_ENTRANCE_SECONDS;
				return;
			}
		}
		if (tour.reader === "zooming") {
			if (!readShot.current)
				readShot.current = {
					elapsed: 0,
					position: camera.position.clone(),
					target: orbit.target.clone(),
				};
			const shot = readShot.current;
			shot.elapsed += Math.min(delta, 0.1);
			const t = reducedMotion ? 1 : Math.min(1, shot.elapsed / 2.1);
			const ease = t * t * t * (t * (t * 6 - 15) + 10);
			target.set(...focusBookPosition(book.id));
			position
				.set(0, 0.12, 1.65)
				.multiplyScalar(
					Math.max(1, (size.height / size.width) * 0.9) * bookScale,
				)
				.add(target);
			camera.position.lerpVectors(shot.position, position, ease);
			camera.position.x += Math.sin(t * Math.PI) * bookScale * 0.22;
			camera.position.y += Math.sin(t * Math.PI) * bookScale * 0.1;
			orbit.target.lerpVectors(shot.target, target, ease);
			orbit.update();
			if (t === 1) useTourStore.setState({ reader: "open" });
			return;
		}
		readShot.current = null;
		if (editing && (stage === "library" || stage === "pick")) {
			if (drag) {
				if (!dragView.current) {
					dragView.current = {
						target: orbit.target.clone(),
						offset: camera.position
							.clone()
							.sub(orbit.target)
							.multiplyScalar(1.65),
					};
				}
				// Follow most of the book's travel while keeping nearby shelves visible.
				target
					.copy(dragView.current.target)
					.addScaledVector(position.set(...drag.offset), 0.8);
				position.copy(target).add(dragView.current.offset);
				const smoothing = reducedMotion
					? 1
					: 1 - Math.exp(-Math.min(delta, 0.1) * 7);
				camera.position.lerp(position, smoothing);
				orbit.target.lerp(target, smoothing);
				orbit.update();
				return;
			}
			if (editorGesture.current) return;
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
				!centered &&
				!userAddition &&
				!drag &&
				reader === "closed" &&
				stage !== "pull" &&
				stage !== "return"
			}
			enableRotate={!editing}
			enablePan={!editing}
			enableZoom={!drag}
			enableDamping={!centered}
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
