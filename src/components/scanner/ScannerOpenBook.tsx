import { Html } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { BookOpen, Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
	type Group,
	type InstancedMesh,
	Matrix4,
	Quaternion,
	SRGBColorSpace,
	Texture,
	Vector3,
} from "three";
import {
	BOOK_SIZE_LIMITS_CM,
	type BookSizeCm,
	CM_PER_WORLD_UNIT,
} from "../../stores/useBookSizeStore";
import { getControllerJoystick } from "../tour/controllerJoystick";
import { pagePhotos, type ScanPhoto } from "./scanDrafts";
import "./scanner-open-book.css";

const OPEN = 1; // radians each cover/leaf swings from the spine
/** Fixed framing for the widest allowed book, so every book is shown 1:1. */
const VIEW_DISTANCE =
	(BOOK_SIZE_LIMITS_CM.width[1] * 2 * 1.15) / CM_PER_WORLD_UNIT;
const WINDOW = 4; // interactive leaves each side of the opening

export { pagePhotos };

const prefersReducedMotion = () =>
	typeof window !== "undefined" &&
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * One page's hinge. It eases toward lying open on the right (a page still to
 * come) or turned over to the left (a page already scanned) and lifts a
 * little mid-turn, so a new scan folds over smoothly. A page that appears
 * starts at its final angle, so jumping across the book never flips hundreds
 * of pages. Reduced motion snaps.
 */
function FoldingLeaf({
	turned,
	lift,
	position,
	children,
}: {
	/** True once the page has been turned over to the left. */
	turned: boolean;
	/** How far the page rises at the middle of the turn. */
	lift: number;
	position: [number, number, number];
	children: ReactNode;
}) {
	const hinge = useRef<Group>(null);
	const target = turned ? -OPEN : OPEN;
	const angle = useRef(target);
	const first = useRef(target);
	useFrame((_, delta) => {
		const group = hinge.current;
		if (!group) return;
		if (prefersReducedMotion()) angle.current = target;
		else {
			const ease = 1 - Math.exp(-Math.min(delta, 0.06) * 6);
			angle.current += (target - angle.current) * ease;
			if (Math.abs(target - angle.current) < 0.002) angle.current = target;
		}
		group.rotation.y = angle.current;
		const progress = Math.min(1, Math.abs(target - angle.current) / (2 * OPEN));
		group.position.y = Math.sin(progress * Math.PI) * lift;
	});
	return (
		<group position={position}>
			<group ref={hinge} rotation={[0, first.current, 0]}>
				{children}
			</group>
		</group>
	);
}

function Leaf({
	width,
	height,
	thickness,
	image,
	even,
}: {
	width: number;
	height: number;
	thickness: number;
	image?: string;
	even: boolean;
}) {
	const [texture, setTexture] = useState<Texture | null>(null);
	const current = useRef<Texture | null>(null);
	useEffect(() => {
		let active = true;
		if (!image) {
			current.current?.dispose();
			current.current = null;
			setTexture(null);
			return;
		}
		// Keep showing the old page until the new one is decoded, and skip
		// three's global Cache so live-crop data URLs aren't kept forever.
		const element = new Image();
		element.onload = () => {
			if (!active) return;
			const next = new Texture(element);
			next.colorSpace = SRGBColorSpace;
			next.needsUpdate = true;
			current.current?.dispose();
			current.current = next;
			setTexture(next);
		};
		element.src = image;
		return () => {
			active = false;
		};
	}, [image]);
	useEffect(
		() => () => {
			current.current?.dispose();
			current.current = null;
		},
		[],
	);
	return (
		// No shadows between leaves: they sit a hair apart, and self-shadowing
		// turned every leaf in the stack black.
		<mesh position={[width / 2, 0, 0]}>
			<boxGeometry args={[width, height, thickness]} />
			{texture ? (
				<meshStandardMaterial map={texture} roughness={0.9} />
			) : (
				<meshStandardMaterial
					color={even ? "#ffffff" : "#f5f1e8"}
					roughness={0.9}
				/>
			)}
		</mesh>
	);
}

/** Cheap solid leaves outside the interactive window (same trick as OpenBook). */
function Stack({
	pages,
	current,
	width,
	height,
	thickness,
}: {
	pages: number;
	current: number;
	width: number;
	height: number;
	thickness: number;
}) {
	const mesh = useRef<InstancedMesh>(null);
	const scratch = useMemo(
		() => ({
			matrix: new Matrix4(),
			rotation: new Quaternion(),
			position: new Vector3(),
			axis: new Vector3(0, 1, 0),
			scale: new Vector3(1, 1, 1),
		}),
		[],
	);
	useEffect(() => {
		if (!mesh.current) return;
		let count = 0;
		for (let i = 0; i < pages; i++) {
			if (
				i >= Math.max(0, current - WINDOW) &&
				i < Math.min(pages, current + WINDOW + 1)
			)
				continue;
			scratch.rotation.setFromAxisAngle(
				scratch.axis,
				i >= current ? OPEN : -OPEN,
			);
			scratch.position
				.set(width / 2, 0, 0)
				.applyQuaternion(scratch.rotation)
				.add(
					new Vector3(
						-width / 2,
						0,
						thickness * 0.5 - ((i + 0.5) * thickness) / pages,
					),
				);
			scratch.matrix.compose(scratch.position, scratch.rotation, scratch.scale);
			mesh.current.setMatrixAt(count++, scratch.matrix);
		}
		mesh.current.count = count;
		mesh.current.instanceMatrix.needsUpdate = true;
		mesh.current.computeBoundingSphere();
	}, [pages, current, width, thickness, scratch]);
	return (
		<instancedMesh
			key={pages}
			ref={mesh}
			args={[undefined, undefined, Math.max(1, pages)]}
			raycast={() => {}}
		>
			<boxGeometry args={[width, height, thickness / Math.max(1, pages)]} />
			<meshStandardMaterial color="#eee9df" roughness={0.92} />
		</instancedMesh>
	);
}

type FaceImages = { front?: string; back?: string; spine?: string };

/**
 * Loads the cover textures. Each face is tracked on its own: when one image
 * changes only that face reloads, the old texture stays on screen until the
 * new one is ready (no flicker while you drag crop points), and a removed
 * image clears its face. Superseded loads are thrown away.
 */
function useFaceTextures(faces: FaceImages) {
	const [textures, setTextures] = useState<Record<string, Texture>>({});
	const loaded = useRef<Record<string, { url: string; texture: Texture }>>({});
	const wanted = useRef<Record<string, string | undefined>>({});
	const front = faces.front;
	const back = faces.back;
	const spine = faces.spine;
	useEffect(() => {
		const next: Record<string, string | undefined> = { front, back, spine };
		wanted.current = next;
		let changed = false;
		for (const key of Object.keys(next)) {
			const url = next[key];
			const have = loaded.current[key];
			if (!url) {
				if (have) {
					have.texture.dispose();
					delete loaded.current[key];
					changed = true;
				}
				continue;
			}
			if (have?.url === url) continue;
			// Load the image directly instead of through TextureLoader: three's
			// global Cache (on in main.tsx) would keep every live-crop data URL in
			// memory for good, and a crop being dragged makes a new one each time.
			const image = new Image();
			image.onload = () => {
				// Dropped or replaced while loading, or the component is gone.
				if (wanted.current[key] !== url) return;
				const texture = new Texture(image);
				texture.colorSpace = SRGBColorSpace;
				texture.needsUpdate = true;
				loaded.current[key]?.texture.dispose();
				loaded.current[key] = { url, texture };
				setTextures((current) => ({ ...current, [key]: texture }));
			};
			image.src = url;
		}
		if (changed)
			setTextures(
				Object.fromEntries(
					Object.entries(loaded.current).map(([key, item]) => [
						key,
						item.texture,
					]),
				),
			);
	}, [front, back, spine]);
	useEffect(() => {
		const store = loaded.current;
		return () => {
			wanted.current = {};
			for (const item of Object.values(store)) item.texture.dispose();
			loaded.current = {};
		};
	}, []);
	return textures;
}

/** Camera for the open book, framed for the widest allowed book. */
export const OPEN_BOOK_CAMERA = {
	position: [0, VIEW_DISTANCE * 0.85, VIEW_DISTANCE] as [
		number,
		number,
		number,
	],
	fov: 32,
};

/**
 * Turn of the whole book (radians about Y) that brings each part face-on to
 * the camera. The spine already faces the camera; the covers swing open by
 * OPEN, so their outer faces point (π/2 − OPEN) off the camera axis: the front
 * cover to the right, the back cover to the left.
 */
const COVER_TURN = Math.PI / 2 - OPEN;
const SIDE_TURN = {
	front: -COVER_TURN,
	spine: 0,
	back: COVER_TURN,
} as const;
export type OpenBookSide = keyof typeof SIDE_TURN;

export function OpenBookModel({
	size,
	pages,
	current,
	photos,
	faces,
	onPickPage,
	side,
	spread = false,
}: {
	size: BookSizeCm;
	pages: number;
	current: number;
	photos: Map<number, ScanPhoto>;
	faces: { front?: string; back?: string; spine?: string };
	/**
	 * Face the book like an open spread: the page just scanned lies on the left
	 * with the page to scan on the right. Off, the spine faces the camera.
	 */
	spread?: boolean;
	/** Omit to hide the "Scan p.N" buttons (the small previews). */
	onPickPage?: (index: number) => void;
	/** Turn to this cover instead of the idle sway. */
	side?: OpenBookSide;
}) {
	const root = useRef<Group>(null);
	const width = size.width / CM_PER_WORLD_UNIT;
	const height = size.height / CM_PER_WORLD_UNIT;
	const thickness = size.thickness / CM_PER_WORLD_UNIT;
	const leaf = thickness / Math.max(1, pages);
	const textures = useFaceTextures(faces);
	// Gentle idle sway, or ease round to the requested side.
	useFrame((state, delta) => {
		if (!root.current) return;
		if (side) {
			const ease = 1 - Math.exp(-Math.min(delta, 0.06) * 8);
			root.current.rotation.y +=
				(SIDE_TURN[side] - root.current.rotation.y) * ease;
		} else
			root.current.rotation.y =
				-0.35 + Math.sin(state.clock.elapsedTime * 0.3) * 0.08;
		root.current.rotation.x = -0.55;
	});
	const from = Math.max(0, current - WINDOW);
	const to = Math.min(pages, current + WINDOW + 1);
	const leaves = Array.from({ length: to - from }, (_, i) => from + i);
	return (
		<group ref={root} position={[0, 0, 0]}>
			<ambientLight intensity={1.4} />
			<directionalLight position={[1.5, 3, 2]} intensity={1.8} />
			<group rotation={[0, spread ? -Math.PI / 2 : Math.PI / 2, 0]}>
				<Stack
					pages={pages}
					current={current}
					width={width}
					height={height}
					thickness={thickness}
				/>
				{leaves.map((index) => (
					<FoldingLeaf
						key={index}
						turned={index < current}
						lift={height * 0.04}
						position={[-width / 2, 0, thickness * 0.5 - (index + 0.5) * leaf]}
					>
						<Leaf
							width={width}
							height={height}
							thickness={leaf}
							image={photos.get(index)?.crop?.image ?? photos.get(index)?.image}
							even={index % 2 === 0}
						/>
						{onPickPage &&
							(index === current || index === current - 1) &&
							!photos.get(index) && (
								<Html
									position={[width / 2, 0, 0.02]}
									center
									zIndexRange={[20, 0]}
								>
									<button
										type="button"
										className="sob-add"
										onClick={() => onPickPage(index)}
									>
										<Camera size={13} aria-hidden="true" /> Scan p.{index + 1}
									</button>
								</Html>
							)}
					</FoldingLeaf>
				))}
				{/* covers */}
				<group
					position={[-width * 0.501, 0, thickness * 0.5]}
					rotation={[0, -OPEN, 0]}
				>
					<mesh position={[width / 2, 0, 0]}>
						<boxGeometry args={[width, height, 0.004]} />
						<meshStandardMaterial
							map={textures.front ?? null}
							color={textures.front ? "#fff" : "#2d4157"}
							roughness={0.5}
						/>
					</mesh>
				</group>
				<group
					position={[-width * 0.5, 0, -thickness * 0.5]}
					rotation={[0, OPEN, 0]}
				>
					<mesh position={[width / 2, 0, 0]}>
						<boxGeometry args={[width, height, 0.004]} />
						<meshStandardMaterial
							map={textures.back ?? null}
							color={textures.back ? "#fff" : "#2d4157"}
							roughness={0.5}
						/>
					</mesh>
				</group>
				<mesh position={[-width * 0.501, 0, 0]}>
					<boxGeometry args={[0.004, height, thickness]} />
					<meshStandardMaterial
						map={textures.spine ?? null}
						color={textures.spine ? "#fff" : "#22364a"}
						roughness={0.5}
					/>
				</mesh>
			</group>
		</group>
	);
}

/**
 * Open-book view for scanning the inside: the real page count from the
 * enrichment, scanned pages textured onto their leaves, a strip showing
 * where every page sits, and tap-to-scan on empty leaves.
 */
export default function ScannerOpenBook({
	size,
	pages,
	photos,
	faces,
	busy,
	current,
	onCurrent,
	onScanPage,
}: {
	size: BookSizeCm;
	pages: number;
	photos: ScanPhoto[];
	faces: { front?: string; back?: string; spine?: string };
	busy: boolean;
	/** The page the book is open at (0-based). The pages roll shares it. */
	current: number;
	onCurrent: (page: number) => void;
	onScanPage: (index: number) => void;
}) {
	const map = useMemo(() => pagePhotos(photos), [photos]);
	// The book never has fewer leaves than the page you are on: pages go on.
	const total = Math.max(1, pages, current + 1);
	const scanned = map.size;
	const latest = useRef(current);
	latest.current = current;
	// Scanner joystick: push right/left to turn pages (repeats while held).
	useEffect(() => {
		let last = 0;
		let raf = 0;
		const tick = (time: number) => {
			const stick = getControllerJoystick();
			if (Math.abs(stick.x) > 0.45 && time - last > 320 / Math.abs(stick.x)) {
				last = time;
				onCurrent(Math.max(0, latest.current + (stick.x > 0 ? 1 : -1)));
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [onCurrent]);
	return (
		<section className="sob" aria-label="Scan the pages">
			<header className="sob-head">
				<BookOpen size={15} aria-hidden="true" />
				<span>
					Pages
					<small>{scanned} scanned</small>
				</span>
				<div className="sob-nav">
					<button
						type="button"
						aria-label="Previous page"
						disabled={current <= 0}
						onClick={() => onCurrent(Math.max(0, current - 1))}
					>
						<ChevronLeft size={16} />
					</button>
					<output>
						p.{current + 1}
						<span>/{Math.max(total, scanned + 1)}</span>
					</output>
					<button
						type="button"
						aria-label="Next page"
						onClick={() => onCurrent(current + 1)}
					>
						<ChevronRight size={16} />
					</button>
				</div>
			</header>
			<div className="sob-canvas">
				<Canvas
					camera={{
						position: [0, VIEW_DISTANCE * 0.85, VIEW_DISTANCE],
						fov: 32,
					}}
					dpr={[1, 1.5]}
					shadows
				>
					<OpenBookModel
						size={size}
						pages={total}
						current={current}
						photos={map}
						faces={faces}
					/>
				</Canvas>
			</div>
			<div className="scan-rail">
				<button
					type="button"
					className="scan-rail-btn is-primary"
					disabled={busy}
					onClick={() => onScanPage(current)}
				>
					<span className="scan-rail-icon">
						<Camera size={22} aria-hidden="true" />
					</span>
					<span>
						{map.get(current) ? "Rescan" : "Scan"} p.{current + 1}
					</span>
				</button>
			</div>
		</section>
	);
}
