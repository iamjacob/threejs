import { Html } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { BookOpen, Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { ScanPhoto } from "./scanDrafts";
import "./scanner-open-book.css";

const OPEN = 1; // radians each cover/leaf swings from the spine
/** Fixed framing for the widest allowed book, so every book is shown 1:1. */
const VIEW_DISTANCE =
	(BOOK_SIZE_LIMITS_CM.width[1] * 2 * 1.15) / CM_PER_WORLD_UNIT;
const WINDOW = 4; // interactive leaves each side of the opening

/** Which scanned photo belongs to which page index (0-based leaf). */
export function pagePhotos(photos: ScanPhoto[]) {
	const map = new Map<number, ScanPhoto>();
	let next = 0;
	for (const photo of photos) {
		if (["front", "spine", "back", "dustjacket"].includes(photo.tag)) continue;
		const explicit = photo.page;
		const index = explicit ?? next;
		map.set(index, photo);
		next = Math.max(next, index) + 1;
	}
	return map;
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
		<mesh position={[width / 2, 0, 0]} castShadow receiveShadow>
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
}: {
	size: BookSizeCm;
	pages: number;
	current: number;
	photos: Map<number, ScanPhoto>;
	faces: { front?: string; back?: string; spine?: string };
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
			<directionalLight position={[1.5, 3, 2]} intensity={1.8} castShadow />
			<group rotation={[0, Math.PI / 2, 0]}>
				<Stack
					pages={pages}
					current={current}
					width={width}
					height={height}
					thickness={thickness}
				/>
				{leaves.map((index) => (
					<group
						key={index}
						position={[-width / 2, 0, thickness * 0.5 - (index + 0.5) * leaf]}
						rotation={[0, index >= current ? OPEN : -OPEN, 0]}
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
					</group>
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
	onScanPage,
	onSelectPhoto,
}: {
	size: BookSizeCm;
	pages: number;
	photos: ScanPhoto[];
	faces: { front?: string; back?: string; spine?: string };
	busy: boolean;
	onScanPage: (index: number) => void;
	onSelectPhoto: (photo: ScanPhoto) => void;
}) {
	const map = useMemo(() => pagePhotos(photos), [photos]);
	const total = Math.max(1, pages);
	const [current, setCurrent] = useState(() => {
		// Open at the first empty page after the last scanned one.
		const last = Math.max(-1, ...map.keys());
		return Math.min(total - 1, last + 1);
	});
	const scanned = map.size;
	const strip = useRef<HTMLOListElement>(null);
	// Scanner joystick: push right/left to turn pages (repeats while held).
	useEffect(() => {
		let last = 0;
		let raf = 0;
		const tick = (time: number) => {
			const stick = getControllerJoystick();
			if (Math.abs(stick.x) > 0.45 && time - last > 320 / Math.abs(stick.x)) {
				last = time;
				setCurrent((value) =>
					Math.max(0, Math.min(total - 1, value + (stick.x > 0 ? 1 : -1))),
				);
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [total]);
	useEffect(() => {
		strip.current
			?.querySelector<HTMLElement>(`[data-page="${current}"]`)
			?.scrollIntoView({
				inline: "center",
				block: "nearest",
				behavior: "smooth",
			});
	}, [current]);
	return (
		<section className="sob" aria-label="Scan the pages">
			<header className="sob-head">
				<BookOpen size={15} aria-hidden="true" />
				<span>
					Pages
					<small>
						{scanned} of {total} scanned
					</small>
				</span>
				<div className="sob-nav">
					<button
						type="button"
						aria-label="Previous page"
						disabled={current <= 0}
						onClick={() => setCurrent((v) => Math.max(0, v - 1))}
					>
						<ChevronLeft size={16} />
					</button>
					<output>
						p.{current + 1}
						<span>/{total}</span>
					</output>
					<button
						type="button"
						aria-label="Next page"
						disabled={current >= total - 1}
						onClick={() => setCurrent((v) => Math.min(total - 1, v + 1))}
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
						onPickPage={(index) => {
							if (!busy) onScanPage(index);
						}}
					/>
				</Canvas>
			</div>
			<ol className="sob-strip" ref={strip} aria-label="All pages">
				{Array.from({ length: total }, (_, index) => {
					const photo = map.get(index);
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: the page number is the identity of a leaf.
						<li key={`page-${index}`} data-page={index}>
							<button
								type="button"
								className={`sob-page${photo ? " has-scan" : ""}${index === current ? " is-current" : ""}`}
								title={`Page ${index + 1}${photo ? " · scanned" : ""}`}
								aria-label={`Page ${index + 1}${photo ? ", scanned" : ", not scanned"}`}
								aria-current={index === current ? "page" : undefined}
								disabled={busy}
								onClick={() => {
									setCurrent(index);
									if (photo) onSelectPhoto(photo);
								}}
								style={
									photo
										? {
												backgroundImage: `url(${photo.crop?.image ?? photo.image})`,
											}
										: undefined
								}
							>
								{!photo && index % 10 === 0 && <span>{index + 1}</span>}
							</button>
						</li>
					);
				})}
			</ol>
			<button
				type="button"
				className="sob-scan"
				disabled={busy}
				onClick={() => onScanPage(current)}
			>
				<Camera size={15} aria-hidden="true" />
				{map.get(current)
					? `Rescan page ${current + 1}`
					: `Scan page ${current + 1}`}
			</button>
		</section>
	);
}
