import { type ThreeEvent, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { MathUtils, Vector3 } from "three";
import { useShelfControlsStore } from "../../../stores/useShelfControlsStore";
import {
	createBookDragGesture,
	expandShelfSelection,
} from "../../lib/shelfDrag";
import { useBookStore } from "../../stores/useBookStore";
import {
	arrangedBookPose,
	arrangedBooksBounds,
	type ArrangedBook,
} from "./shelfArrangement";
import {
	createShelfDragProjector,
	createShelfStackTargeter,
	shelfDropForPoint,
	shelfFloorY,
} from "./shelfDragGeometry";

export function useShelfBookDrag(enabled: boolean, placements: ArrangedBook[]) {
	const { camera, gl } = useThree();
	const currentPlacements = useRef(placements);
	currentPlacements.current = placements;
	const active = useRef<{
		id: string;
		pointerId: number;
		anchor: Vector3;
		bottomY: number;
		project: ReturnType<typeof createShelfDragProjector>;
		placements: ArrangedBook[];
		minX: number;
		maxX: number;
		release: () => void;
	} | null>(null);
	const gesture = useMemo(
		() =>
			createBookDragGesture({
				onStart: () => {
					if (!active.current) return;
					useShelfControlsStore.getState().beginBookDrag(active.current.id);
					useBookStore.getState().selectBook(active.current.id);
					gl.domElement.style.cursor = "grabbing";
				},
				onMove: (pointer) => {
					const context = active.current;
					const state = useShelfControlsStore.getState();
					if (!context || !state.drag) return;
					const delta = context.project(pointer);
					if (!delta) return;
					const x = MathUtils.clamp(
						context.anchor.x + delta.x,
						context.minX,
						context.maxX,
					);
					const bottomY = MathUtils.clamp(
						context.bottomY + delta.y,
						shelfFloorY(0),
						shelfFloorY(3) + 1.5,
					);
					const drop =
						createShelfStackTargeter(
							camera,
							gl.domElement.getBoundingClientRect(),
							context.placements,
							state.drag.ids,
						)(pointer) ??
						shelfDropForPoint(context.placements, state.drag.ids, x, bottomY);
					// Pull the book toward the viewer while it travels across the arc.
					// The extra depth is eased and bounded by the shelf's usable radius,
					// which makes a drag feel like removing a book from the shelf.
					const pull = MathUtils.clamp(
						0.18 + Math.hypot(delta.x, delta.y) * 0.42,
						0.18,
						0.9,
					);
					state.updateBookDrag(
						[x - context.anchor.x, bottomY - context.bottomY + 0.06, pull],
						drop,
					);
				},
				onEnd: (commit) => {
					useShelfControlsStore.getState().endBookDrag(commit);
				},
			}),
		[camera, gl],
	);
	useEffect(() => {
		if (!enabled) return;
		const release = () => {
			const context = active.current;
			active.current = null;
			context?.release();
			gl.domElement.style.cursor = "";
		};
		const cancel = () => {
			gesture.cancel();
			release();
		};
		const move = (event: PointerEvent) => {
			gesture.move(event);
		};
		const end = (event: PointerEvent) => {
			if (active.current?.pointerId !== event.pointerId) return;
			if (useShelfControlsStore.getState().drag) gesture.move(event);
			gesture.end(event);
			release();
		};
		const pointerCancel = (event: PointerEvent) => {
			if (active.current?.pointerId === event.pointerId) cancel();
		};
		const another = (event: PointerEvent) => {
			if (active.current && active.current.pointerId !== event.pointerId) {
				gesture.additionalPointer(event);
				release();
			}
		};
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape" && active.current) {
				event.preventDefault();
				event.stopImmediatePropagation();
				cancel();
			}
		};
		const hidden = () => {
			if (document.hidden) cancel();
		};
		window.addEventListener("pointermove", move, true);
		window.addEventListener("pointerup", end, true);
		window.addEventListener("pointercancel", pointerCancel, true);
		window.addEventListener("pointerdown", another, true);
		window.addEventListener("keydown", key, true);
		window.addEventListener("blur", cancel);
		gl.domElement.addEventListener("lostpointercapture", pointerCancel);
		document.addEventListener("visibilitychange", hidden);
		// Closing the editor or undoing a move also releases pointer capture.
		const unsubscribe = useShelfControlsStore.subscribe((state, previous) => {
			if (previous.drag && !state.drag && active.current) {
				gesture.cancel();
				release();
			}
		});
		return () => {
			cancel();
			unsubscribe();
			window.removeEventListener("pointermove", move, true);
			window.removeEventListener("pointerup", end, true);
			window.removeEventListener("pointercancel", pointerCancel, true);
			window.removeEventListener("pointerdown", another, true);
			window.removeEventListener("keydown", key, true);
			window.removeEventListener("blur", cancel);
			gl.domElement.removeEventListener("lostpointercapture", pointerCancel);
			document.removeEventListener("visibilitychange", hidden);
		};
	}, [enabled, gesture, gl]);
	return {
		start(id: string, event: ThreeEvent<PointerEvent>) {
			if (!enabled || !event.nativeEvent.isPrimary || event.button !== 0)
				return;
			const placement = currentPlacements.current.find(
				(entry) => entry.book.id === id,
			);
			if (!placement || !gesture.start(event.nativeEvent)) return;
			event.stopPropagation();
			const anchor = new Vector3(...arrangedBookPose(placement).position);
			const state = useShelfControlsStore.getState();
			const ids = expandShelfSelection(
				state.document,
				state.selectedIds.includes(id) ? state.selectedIds : [id],
			);
			const moving = currentPlacements.current.filter((entry) =>
				ids.includes(entry.book.id),
			);
			const libraryBounds = arrangedBooksBounds(currentPlacements.current);
			const rect = gl.domElement.getBoundingClientRect();
			// R3F supplies a capture proxy on target; its base DOM event type omits it.
			const capture = event.target as EventTarget &
				Pick<
					HTMLElement,
					"hasPointerCapture" | "setPointerCapture" | "releasePointerCapture"
				>;
			active.current = {
				id,
				pointerId: event.pointerId,
				anchor,
				bottomY: arrangedBooksBounds(moving).min.y,
				placements: currentPlacements.current,
				minX: Math.min(-1.95, libraryBounds.min.x - 0.5),
				maxX: Math.max(1.95, libraryBounds.max.x + 0.5),
				project: createShelfDragProjector(
					camera,
					rect,
					anchor,
					event.nativeEvent,
				),
				release: () => {
					if (capture.hasPointerCapture(event.pointerId))
						capture.releasePointerCapture(event.pointerId);
				},
			};
			capture.setPointerCapture(event.pointerId);
		},
		consumeClick: gesture.consumeClick,
	};
}
