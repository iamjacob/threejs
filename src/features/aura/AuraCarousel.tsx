import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import {
	type ReactNode,
	Suspense,
	useEffect,
	useLayoutEffect,
	useRef,
} from "react";
import type { Group, PerspectiveCamera } from "three";
import FocusedAura from "./FocusedAura";
import { useAuraFocus } from "./focusStore";
import type { AuraBook } from "./mockData";
import {
	auraMotion,
	clamp,
	easeInOutCubic,
	GLIDE_MS,
	MAX_FRAME_S,
} from "./motion";
import Vignette from "./Vignette";

export const SHELF_Z = -8;

/**
 * Cover-flow pose, in the shelf group's local space. The focused book comes
 * forward; the others sit back, slightly smaller, turned toward the centre.
 */
function poseBook(
	group: Group,
	index: number,
	width: number,
	dimensions: [number, number, number],
	seed: number,
	camera: PerspectiveCamera,
	elapsed: number,
) {
	const offset = index - auraMotion.vis;
	const distance = Math.abs(offset);
	const mobile = width < 700;
	const spacing = mobile ? 0.92 : 1.18;
	const coverH = mobile ? 1.36 : 1.08;
	const span = distance < 1 ? distance : 1 + (distance - 1) * 0.58;
	const near = Math.max(0, 1 - distance);
	const x = Math.sign(offset) * span * spacing;
	const z =
		near * 0.42 -
		Math.min(distance, 1) * 0.95 -
		Math.max(distance - 1, 0) * 0.3;
	const pose =
		1 - 0.17 * Math.min(distance, 1) - 0.05 * clamp(distance - 1, 0, 2);
	const sway = near * (auraMotion.reduced ? 0 : 1);
	const depth = camera.position.z - (SHELF_Z + z);
	const viewAngle = Math.atan2(x - camera.position.x, depth);
	const yaw =
		0.4 -
		viewAngle -
		0.36 * clamp(offset, -1, 1) +
		sway * 0.07 * Math.sin(elapsed * 0.45 + seed * 6.28);
	const pitch = -0.1 + sway * 0.035 * Math.sin(elapsed * 0.37 + seed * 3.1);
	const roll = sway * 0.012 * Math.sin(elapsed * 0.3 + seed * 9);
	group.position.set(x, sway * 0.03 * Math.sin(elapsed * 0.8 + seed * 4), z);
	group.rotation.set(pitch, yaw, roll);
	group.scale.setScalar((coverH / dimensions[1]) * pose);
}

function CarouselDriver({ itemsRef }: { itemsRef: { current: AuraBook[] } }) {
	const glide = useRef<{ from: number; to: number; t0: number } | null>(null);
	const clock = useRef(0);
	useFrame((_, delta) => {
		clock.current += Math.min(delta, MAX_FRAME_S) * 1000;
		const items = itemsRef.current;
		const { focusedId, cursor } = useAuraFocus.getState();
		const found = focusedId
			? items.findIndex((item) => item.bookId === focusedId)
			: cursor;
		const target = found < 0 ? 0 : found;
		if (auraMotion.snap || auraMotion.reduced) {
			auraMotion.vis = target;
			auraMotion.snap = false;
			glide.current = null;
			return;
		}
		if (auraMotion.scrolling) return;
		const current = glide.current;
		if (!current || current.to !== target) {
			if (Math.abs(auraMotion.vis - target) <= 0.001) {
				auraMotion.vis = target;
				glide.current = null;
				return;
			}
			glide.current = { from: auraMotion.vis, to: target, t0: clock.current };
		}
		const glideNow = glide.current;
		if (!glideNow) return;
		const progress = Math.min(1, (clock.current - glideNow.t0) / GLIDE_MS);
		auraMotion.vis =
			glideNow.from + (glideNow.to - glideNow.from) * easeInOutCubic(progress);
		if (progress >= 1) {
			auraMotion.vis = glideNow.to;
			glide.current = null;
		}
	});
	return null;
}

function CarouselBook({
	item,
	index,
	renderBook,
}: {
	item: AuraBook;
	index: number;
	renderBook: (book: AuraBook) => ReactNode;
}) {
	const groupRef = useRef<Group>(null);
	const register = useAuraFocus((state) => state.register);
	useLayoutEffect(() => {
		const group = groupRef.current;
		if (!group) return;
		register(item.bookId, { object: group, dimensions: item.dimensions });
		return () => register(item.bookId, null);
	}, [item.bookId, item.dimensions, register]);
	useFrame(({ size, camera, clock }) => {
		const group = groupRef.current;
		if (!group) return;
		poseBook(
			group,
			index,
			size.width,
			item.dimensions,
			item.seed,
			camera as PerspectiveCamera,
			clock.elapsedTime,
		);
	});
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Three.js group; arrow keys and the buttons offer the same focus change.
		<group
			ref={groupRef}
			name={item.bookId}
			onClick={(event) => {
				event.stopPropagation();
				if (auraMotion.dragMoved) return;
				const { focusedId, focusIndex, clear } = useAuraFocus.getState();
				if (focusedId === item.bookId) clear();
				else focusIndex(index);
			}}
		>
			{renderBook(item)}
		</group>
	);
}

function FrameCamera() {
	useFrame(({ camera }) => {
		camera.position.set(0, 0.14, SHELF_Z + 3.55);
		camera.lookAt(0, -0.04, SHELF_Z);
	});
	return null;
}

function WheelInput() {
	const gl = useThree((state) => state.gl);
	useEffect(() => {
		let last = 0;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const now = performance.now();
			if (now - last < 240) return;
			const delta =
				Math.abs(event.deltaY) >= Math.abs(event.deltaX)
					? event.deltaY
					: event.deltaX;
			if (Math.abs(delta) < 1) return;
			last = now;
			auraMotion.scrolling = false;
			useAuraFocus.getState().step(Math.sign(delta));
		};
		gl.domElement.addEventListener("wheel", onWheel, { passive: false });
		return () => gl.domElement.removeEventListener("wheel", onWheel);
	}, [gl]);
	return null;
}

function Shelf({
	items,
	itemsRef,
	renderBook,
}: {
	items: AuraBook[];
	itemsRef: { current: AuraBook[] };
	renderBook: (book: AuraBook) => ReactNode;
}) {
	const drag = useRef({
		active: false,
		x: 0,
		lastX: 0,
		lastT: 0,
		vel: 0,
		moved: false,
		vis0: 0,
	});
	const sizeRef = useRef({ width: 1, height: 1 });
	useFrame(({ size }) => {
		sizeRef.current = size;
	});
	useEffect(() => {
		const move = (event: PointerEvent) => {
			const state = drag.current;
			if (!state.active) return;
			const dx = event.clientX - state.x;
			if (!state.moved && Math.abs(dx) <= 6) return;
			state.moved = true;
			auraMotion.dragMoved = true;
			const now = performance.now();
			state.vel =
				(event.clientX - state.lastX) / Math.max(1, now - state.lastT);
			state.lastX = event.clientX;
			state.lastT = now;
			const width = sizeRef.current.width;
			const pxPerBook = Math.max(96, width * (width < 700 ? 0.52 : 0.2));
			const count = Math.max(1, itemsRef.current.length);
			auraMotion.scrolling = true;
			auraMotion.vis = clamp(state.vis0 - dx / pxPerBook, 0, count - 1);
			useAuraFocus.getState().focusIndex(Math.round(auraMotion.vis));
		};
		const up = () => {
			const state = drag.current;
			if (!state.active) return;
			state.active = false;
			auraMotion.dragMoved = state.moved;
			if (!state.moved) {
				auraMotion.scrolling = false;
				return;
			}
			const nudged = auraMotion.vis - clamp(state.vel * 0.45, -1, 1);
			auraMotion.scrolling = false;
			useAuraFocus.getState().focusIndex(Math.round(nudged));
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
		return () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
		};
	}, [itemsRef]);

	const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
		if (
			event.nativeEvent.button !== 0 &&
			event.nativeEvent.pointerType === "mouse"
		)
			return;
		auraMotion.dragMoved = false;
		drag.current = {
			active: true,
			x: event.nativeEvent.clientX,
			lastX: event.nativeEvent.clientX,
			lastT: performance.now(),
			vel: 0,
			moved: false,
			vis0: auraMotion.vis,
		};
	};

	return (
		<group position={[0, 0, SHELF_Z]} onPointerDown={onPointerDown}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: Invisible Three.js catcher for clicks on empty space. */}
			<mesh
				position={[0, 0, -3]}
				onClick={(event) => {
					event.stopPropagation();
					if (auraMotion.dragMoved) return;
					useAuraFocus.getState().clear();
				}}
			>
				<planeGeometry args={[40, 24]} />
				<meshBasicMaterial colorWrite={false} depthWrite={false} />
			</mesh>
			<CarouselDriver itemsRef={itemsRef} />
			{items.map((item, index) => (
				<CarouselBook
					key={item.bookId}
					item={item}
					index={index}
					renderBook={renderBook}
				/>
			))}
		</group>
	);
}

export default function AuraCarousel({
	items,
	renderBook,
	lighting,
}: {
	items: AuraBook[];
	/** Host mesh for one book. The group around it is posed and registered. */
	renderBook: (book: AuraBook) => ReactNode;
	/** Optional lights. Omit them when the host canvas already has a rig. */
	lighting?: ReactNode;
}) {
	const itemsRef = useRef(items);
	itemsRef.current = items;
	const shelf = useAuraFocus((state) => state.shelf);
	useEffect(() => {
		auraMotion.snap = shelf === "me" || shelf === "freja";
		auraMotion.scrolling = false;
	}, [shelf]);
	return (
		<>
			<Vignette />
			<FrameCamera />
			<WheelInput />
			<Suspense fallback={null}>
				{lighting}
				<Shelf
					key={shelf}
					items={items}
					itemsRef={itemsRef}
					renderBook={renderBook}
				/>
				<FocusedAura itemsRef={itemsRef} />
			</Suspense>
		</>
	);
}
