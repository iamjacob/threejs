import { RotateCcw } from "lucide-react";
import { Edges, Html, Line } from "@react-three/drei";
import {
	type ThreeEvent,
	useFrame,
	useLoader,
	useThree,
} from "@react-three/fiber";
import {
	Suspense,
	startTransition,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	LoadingManager,
	type Mesh,
	type Group,
	Euler,
	Quaternion,
	SRGBColorSpace,
	TextureLoader,
	Vector3,
} from "three";
import { useShelfControlsStore } from "../../../stores/useShelfControlsStore";
import { createBookLongPress, vibrateBookEdit } from "../../lib/bookLongPress";
import { useBookStore } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";
import { moveShelfBooks } from "../../lib/shelfDrag";
import { useShelfBookDrag } from "./useShelfBookDrag";

import {
	type BookImageLevel,
	bookImageHeight,
	bookImagePath,
} from "../../lib/bookImages";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { BOOK_MATERIAL } from "../book/bookAppearance";
import { getBookTextureUrls } from "../book/bookTextures";
import type { BookPose } from "../tour/tourStages";
import CollectionBlur from "./CollectionBlur";
import {
	arrangeShelfBooks,
	arrangedBookPose,
	arrangedBooksBounds,
	type ArrangedBook,
} from "./shelfArrangement";
import { progressionConfig } from "./progressionConfig";
import ShelfBookDissolve from "./ShelfBookDissolve";
import Shelves from "./Shelves";
import {
	BOOKS_SHELF_LEVEL,
	layoutShelfBooks,
	type ShelfBook,
} from "./shelfBooks";

// Initial covers participate in the loader; later LOD upgrades stay in the background.
const shelfTextureLoader = new TextureLoader();
const detailTextureLoader = new TextureLoader(new LoadingManager());

export function shelfBookPose(id: string): BookPose {
	const { document, initialized } = useShelfControlsStore.getState();
	const shelfBooks = useBookStore.getState().books;
	const defaultPlacements = layoutShelfBooks(
		shelfBooks,
		progressionConfig.levels[BOOKS_SHELF_LEVEL].shelves,
	);
	const placements = initialized
		? arrangeShelfBooks(shelfBooks, document)
		: defaultPlacements.map((item) => ({ ...item, scale: 1 }));
	const placement =
		placements.find(({ book }) => book.id === id) ?? placements[0];
	return placement
		? arrangedBookPose(placement)
		: { position: [0, 0, -7.4], quaternion: [0, 0, 0, 1] };
}

function CollectionBook({
	book,
	onSelect,
	onEdit,
	dragControls,
	blurred,
	deleteStartedAt,
	onDeleteComplete,
}: {
	book: ShelfBook;
	onSelect?: (id: string, pose: BookPose) => void;
	onEdit?: (id: string) => void;
	dragControls?: ReturnType<typeof useShelfBookDrag>;
	blurred: boolean;
	deleteStartedAt?: number;
	onDeleteComplete?: (id: string) => void;
}) {
	const mesh = useRef<Mesh>(null);
	const canHold = Boolean(onEdit) && !dragControls;
	const draggable = Boolean(dragControls);
	const editCallback = useRef(onEdit);
	editCallback.current = onEdit;
	const longPress = useMemo(
		() =>
			createBookLongPress(() => {
				if (!editCallback.current) return;
				editCallback.current(book.id);
				vibrateBookEdit();
			}),
		[book.id],
	);
	useEffect(() => {
		if (!canHold || deleteStartedAt !== undefined) {
			longPress.cancel();
			return;
		}
		const cancelWhenHidden = () => {
			if (document.hidden) longPress.cancel();
		};
		window.addEventListener("pointermove", longPress.move, true);
		window.addEventListener("pointerup", longPress.end, true);
		window.addEventListener("pointercancel", longPress.end, true);
		window.addEventListener("pointerdown", longPress.additionalPointer, true);
		window.addEventListener("blur", longPress.cancel);
		document.addEventListener("visibilitychange", cancelWhenHidden);
		return () => {
			longPress.cancel();
			window.removeEventListener("pointermove", longPress.move, true);
			window.removeEventListener("pointerup", longPress.end, true);
			window.removeEventListener("pointercancel", longPress.end, true);
			window.removeEventListener(
				"pointerdown",
				longPress.additionalPointer,
				true,
			);
			window.removeEventListener("blur", longPress.cancel);
			document.removeEventListener("visibilitychange", cancelWhenHidden);
		};
	}, [canHold, deleteStartedAt, longPress]);
	const [imageLevel, setImageLevel] = useState<BookImageLevel>("low");
	const requestedLevel = useRef<BookImageLevel>("low");
	const nextCheck = useRef(0);
	const viewPosition = useMemo(() => new Vector3(), []);
	useFrame(({ camera, size, gl, clock }) => {
		if (!mesh.current || clock.elapsedTime < nextCheck.current) return;
		nextCheck.current = clock.elapsedTime + 0.3;
		// New shelf meshes have no rendered world matrix yet on their first frame.
		mesh.current.updateWorldMatrix(true, false);
		camera.updateMatrixWorld();
		viewPosition
			.setFromMatrixPosition(mesh.current.matrixWorld)
			.applyMatrix4(camera.matrixWorldInverse);
		if (viewPosition.z >= 0) return;
		const projection = camera.projectionMatrix.elements;
		const halfHeight =
			(book.dimensions[1] * projection[5]) / (-2 * viewPosition.z);
		const halfWidth =
			((book.dimensions[0] + book.dimensions[2]) * projection[0]) /
			(-2 * viewPosition.z);
		if (
			Math.abs((viewPosition.x * projection[0]) / -viewPosition.z) >
				1 + halfWidth ||
			Math.abs((viewPosition.y * projection[5]) / -viewPosition.z) >
				1 + halfHeight
		)
			return;
		const pixels = halfHeight * size.height * gl.getPixelRatio();
		const lowHeight = bookImageHeight(book.cover.front, "low");
		const detailHeight = bookImageHeight(book.cover.front, "detail");
		const level: BookImageLevel =
			pixels > detailHeight * 1.15
				? "original"
				: pixels > lowHeight * 1.15
					? "detail"
					: "low";
		if (level === requestedLevel.current) return;
		// Hysteresis prevents repeated swaps near a resolution boundary.
		if (level === "low" && pixels > lowHeight * 0.8) return;
		if (
			requestedLevel.current === "original" &&
			level === "detail" &&
			pixels > detailHeight * 0.8
		)
			return;
		requestedLevel.current = level;
		startTransition(() => setImageLevel(level));
	});
	const [hovered, setHovered] = useState(false);
	useEffect(() => {
		if (!hovered || !onSelect || deleteStartedAt !== undefined) return;
		document.body.style.cursor = draggable ? "grab" : "pointer";
		return () => {
			document.body.style.cursor = "";
		};
	}, [hovered, onSelect, deleteStartedAt, draggable]);
	const urls = useMemo(
		() =>
			getBookTextureUrls(book.cover).map((url) =>
				publicAssetUrl(bookImagePath(url, imageLevel)),
			),
		[book.cover, imageLevel],
	);
	const textures = useLoader(
		imageLevel === "low" ? shelfTextureLoader : detailTextureLoader,
		urls,
	);
	useEffect(() => {
		for (const texture of textures) {
			texture.colorSpace = SRGBColorSpace;
			texture.needsUpdate = true;
		}
	}, [textures]);
	const anisotropy = useThree((state) =>
		Math.min(4, state.gl.capabilities.getMaxAnisotropy()),
	);
	return (
		<group>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: Canvas book; the Open book button offers a keyboard alternative. */}
			<mesh
				ref={mesh}
				name={`shelf-book-${book.id}`}
				// Stop casting the solid box silhouette when the cover dissolves.
				castShadow={deleteStartedAt === undefined}
				receiveShadow
				userData={{
					imageLevel,
					title: book.title,
					bookId: book.id,
					blurred,
					deleting: deleteStartedAt !== undefined,
				}}
				onPointerOver={(event) => {
					if (onSelect) {
						event.stopPropagation();
						setHovered(true);
					}
				}}
				onPointerOut={() => {
					setHovered(false);
					longPress.cancel();
				}}
				onPointerDown={(event) => {
					if (dragControls && deleteStartedAt === undefined) {
						dragControls.start(book.id, event);
						return;
					}
					if (!onEdit || deleteStartedAt !== undefined) return;
					event.stopPropagation();
					longPress.start(event.nativeEvent);
				}}
				onContextMenu={(event) => {
					if (onEdit) {
						event.stopPropagation();
						event.nativeEvent.preventDefault();
					}
				}}
				onClick={(event: ThreeEvent<MouseEvent>) => {
					if (dragControls?.consumeClick()) {
						event.stopPropagation();
						return;
					}
					if (longPress.consumeClick()) {
						event.stopPropagation();
						return;
					}
					if (!onSelect || event.delta > 5 || deleteStartedAt !== undefined)
						return;
					event.stopPropagation();
					const position = event.object
						.getWorldPosition(new Vector3())
						.toArray();
					const quaternion = event.object
						.getWorldQuaternion(new Quaternion())
						.toArray();
					onSelect(book.id, { position, quaternion });
				}}
			>
				<boxGeometry args={book.dimensions} />
				{onDeleteComplete ? (
					<ShelfBookDissolve
						textures={textures}
						startedAt={deleteStartedAt}
						onComplete={() => onDeleteComplete(book.id)}
					/>
				) : (
					textures.map((texture, index) => (
						<meshStandardMaterial
							key={["edge", "spine", "top", "bottom", "front", "back"][index]}
							attach={`material-${index}`}
							{...BOOK_MATERIAL}
							map={texture}
							map-anisotropy={anisotropy}
						/>
					))
				)}
			</mesh>
		</group>
	);
}

export default function Bookshelves({
	onBookSelect,
	hiddenBookId,
	returningBookId,
	blurredBookIds = [],
	hiddenBookIds = [],
	deletingBooks = {},
	onDeleteComplete,
}: {
	onBookSelect?: (id: string, pose: BookPose) => void;
	hiddenBookId?: string;
	returningBookId?: string | null;
	blurredBookIds?: string[];
	hiddenBookIds?: string[];
	deletingBooks?: Record<string, number>;
	onDeleteComplete?: (id: string) => void;
} = {}) {
	const shelfBooks = useBookStore((state) => state.books);
	const stage = useTourStore((state) => state.stage);
	const canEdit = stage === "library" || stage === "pick";
	const document = useShelfControlsStore((state) => state.document);
	const initialized = useShelfControlsStore((state) => state.initialized);
	const editing = useShelfControlsStore((state) => state.editing);
	const selectedIds = useShelfControlsStore((state) => state.selectedIds);
	const activeStackId = useShelfControlsStore((state) => state.activeStackId);
	const selectBook = useShelfControlsStore((state) => state.selectBook);
	const placements = useMemo(
		() =>
			initialized
				? arrangeShelfBooks(shelfBooks, document)
				: layoutShelfBooks(
						shelfBooks,
						progressionConfig.levels[BOOKS_SHELF_LEVEL].shelves,
					).map((item) => ({ ...item, scale: 1 })),
		[document, initialized, shelfBooks],
	);
	const drag = useShelfControlsStore((state) => state.drag);
	const dragControls = useShelfBookDrag(editing && canEdit, placements);
	const dropPlacements = useMemo(
		() =>
			drag?.moved
				? arrangeShelfBooks(
						shelfBooks,
						moveShelfBooks(document, drag.ids, drag.drop),
					)
				: placements,
		[document, shelfBooks, drag?.ids, drag?.drop, drag?.moved, placements],
	);
	const preview = drag
		? dropPlacements.map((entry) =>
				drag.ids.includes(entry.book.id)
					? (placements.find(
							(original) => original.book.id === entry.book.id,
						) ?? entry)
					: entry,
			)
		: placements;
	const visible = preview.filter(
		({ book }) =>
			book.id !== hiddenBookId &&
			book.id !== returningBookId &&
			!hiddenBookIds.includes(book.id),
	);
	return (
		<>
			<Shelves fixedLevel={BOOKS_SHELF_LEVEL}>
				{blurredBookIds.length > 0 && (
					<CollectionBlur
						placements={visible.filter(({ book }) =>
							blurredBookIds.includes(book.id),
						)}
					/>
				)}
				{visible.map((placement) => (
					<AnimatedPlacement key={placement.book.id} placement={placement}>
						<Suspense fallback={null}>
							<CollectionBook
								book={placement.book}
								dragControls={editing && canEdit ? dragControls : undefined}
								onSelect={editing ? (id) => selectBook(id) : onBookSelect}
								onEdit={
									canEdit
										? (id) => {
												useBookStore.getState().selectBook(id);
												useTourStore.setState({ paused: true });
												useShelfControlsStore.getState().openBookEditor(id);
											}
										: undefined
								}
								blurred={blurredBookIds.includes(placement.book.id)}
								deleteStartedAt={deletingBooks[placement.book.id]}
								onDeleteComplete={onDeleteComplete}
							/>
						</Suspense>
						{editing &&
							selectedIds.includes(placement.book.id) &&
							(!activeStackId || drag) && (
								<mesh raycast={() => null}>
									<boxGeometry
										args={
											placement.book.dimensions.map(
												(value) => value + 0.035,
											) as [number, number, number]
										}
									/>
									<meshBasicMaterial visible={false} />
									<Edges
										color="#ff2636"
										lineWidth={2}
										threshold={15}
										raycast={() => null}
									/>
								</mesh>
							)}
					</AnimatedPlacement>
				))}
			</Shelves>
			{editing && !drag && <ShelfAnnotations placements={visible} />}
			{drag?.moved && (
				<ShelfDropPreview
					placements={dropPlacements.filter((entry) =>
						drag.ids.includes(entry.book.id),
					)}
					shelf={drag.drop.shelf}
				/>
			)}
		</>
	);
}

function AnimatedPlacement({
	placement,
	children,
}: {
	placement: ArrangedBook;
	children: React.ReactNode;
}) {
	const ref = useRef<Group>(null);
	const initial = useRef(placement).current;
	const target = useMemo(
		() => ({
			position: new Vector3(...placement.position),
			rotation: new Quaternion().setFromEuler(new Euler(...placement.rotation)),
			scale: new Vector3().setScalar(placement.scale),
		}),
		[placement],
	);
	const reducedMotion = useMemo(
		() => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		[],
	);
	const dragPosition = useMemo(() => new Vector3(), []);
	useFrame((_, delta) => {
		if (!ref.current) return;
		const drag = useShelfControlsStore.getState().drag;
		const moving = drag?.ids.includes(placement.book.id);
		dragPosition.copy(target.position);
		if (moving && drag) {
			// The shelf parent is rotated 90° around Y; convert the world drag vector.
			dragPosition.x -= drag.offset[2];
			dragPosition.y += drag.offset[1];
			dragPosition.z += drag.offset[0];
		}
		const speed = reducedMotion
			? 1
			: 1 - Math.exp(-Math.min(delta, 0.1) * (moving ? 24 : 12));
		ref.current.position.lerp(dragPosition, speed);
		ref.current.quaternion.slerp(target.rotation, speed);
		ref.current.scale.lerp(target.scale, speed);
	});
	return (
		<group
			ref={ref}
			position={initial.position}
			rotation={initial.rotation}
			scale={initial.scale}
			userData={{
				shelfIndex: placement.shelfIndex,
				bookId: placement.book.id,
				stackId: placement.stackId,
			}}
		>
			{children}
		</group>
	);
}

function ShelfDropPreview({
	placements,
	shelf,
}: {
	placements: ArrangedBook[];
	shelf: number;
}) {
	const box = arrangedBooksBounds(placements).expandByScalar(0.025);
	if (box.isEmpty()) return null;
	const z = box.max.z + 0.02;
	return (
		<group name="shelf-drop-preview">
			<Line
				points={[
					[box.min.x, box.min.y, z],
					[box.min.x, box.max.y, z],
					[box.max.x, box.max.y, z],
					[box.max.x, box.min.y, z],
					[box.min.x, box.min.y, z],
				]}
				color="#f5d6a0"
				lineWidth={1.5}
				dashed
				dashSize={0.035}
				gapSize={0.022}
				raycast={() => null}
			/>
			<Html
				center
				position={[(box.min.x + box.max.x) / 2, box.max.y + 0.12, z]}
				style={{ pointerEvents: "none" }}
				zIndexRange={[100, 0]}
			>
				<span className="shelf-drop-label">
					Shelf {shelf + 1} · Release to place
				</span>
			</Html>
		</group>
	);
}

function ShelfAnnotations({ placements }: { placements: ArrangedBook[] }) {
	const { document, selectedIds, activeStackId, selectGroup, setAngle } =
		useShelfControlsStore();
	const selected = placements.filter(({ book }) =>
		selectedIds.includes(book.id),
	);
	const single = selected.length === 1 && !activeStackId ? selected[0] : null;
	const groups = document.groups.flatMap((group) =>
		[0, 1, 2, 3]
			.map((shelf) => ({
				...group,
				key: `${group.id}-${shelf}`,
				placements: placements.filter(
					(item) =>
						group.bookIds.includes(item.book.id) && item.shelfIndex === shelf,
				),
			}))
			.filter((entry) => entry.placements.length > 1),
	);
	if (activeStackId && selected.length)
		groups.push({
			id: activeStackId,
			key: activeStackId,
			name: "",
			bookIds: selectedIds,
			placements: selected,
		});
	return (
		<>
			{groups.map((group) => {
				const box = arrangedBooksBounds(group.placements).expandByScalar(0.06);
				const z = box.max.z + 0.025;
				const points: [number, number, number][] = [
					[box.min.x, box.min.y, z],
					[box.min.x, box.max.y, z],
					[box.max.x, box.max.y, z],
					[box.max.x, box.min.y, z],
					[box.min.x, box.min.y, z],
				];
				const stack = group.id === activeStackId;
				return (
					<group key={group.key}>
						<Line
							points={points}
							color={stack ? "#ff2636" : "#b7bac9"}
							lineWidth={stack ? 2.5 : 1}
							dashed={!stack}
							dashSize={0.025}
							gapSize={0.016}
							raycast={() => null}
						/>
						{!stack && (
							<Html
								position={[box.min.x + 0.08, box.max.y, z]}
								zIndexRange={[100, 0]}
							>
								<button
									type="button"
									className="shelf-group-label"
									onClick={() => selectGroup(group.id)}
								>
									{group.name} · {group.bookIds.length}
								</button>
							</Html>
						)}
					</group>
				);
			})}
			{single &&
				(() => {
					const box = arrangedBooksBounds([single]);
					const angle = document.items[single.book.id]?.angle ?? 0;
					return (
						<Html
							position={[
								(box.min.x + box.max.x) / 2,
								box.max.y + 0.08,
								box.max.z,
							]}
							center
							zIndexRange={[110, 0]}
						>
							<div className="shelf-angle-handle">
								<span>{angle}°</span>
								<button
									type="button"
									aria-label="Reset selected book angle"
									title="Reset angle"
									onClick={() => setAngle(0)}
								>
									<RotateCcw size={15} strokeWidth={1.7} />
								</button>
							</div>
						</Html>
					);
				})()}
		</>
	);
}
