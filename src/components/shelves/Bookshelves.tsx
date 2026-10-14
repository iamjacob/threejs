import { Html, Line } from "@react-three/drei";
import {
	type ThreeEvent,
	useFrame,
	useLoader,
	useThree,
} from "@react-three/fiber";
import { Unlink } from "lucide-react";
import {
	Suspense,
	startTransition,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	Euler,
	type Group,
	LoadingManager,
	type Mesh,
	Quaternion,
	SRGBColorSpace,
	TextureLoader,
	Vector3,
} from "three";
import { useShelfControlsStore } from "../../../stores/useShelfControlsStore";
import {
	type BookImageLevel,
	bookImageHeight,
	bookImagePath,
} from "../../lib/bookImages";
import { createBookLongPress, vibrateBookEdit } from "../../lib/bookLongPress";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { SHOW_PICTURE_FRAME } from "../../lib/featureFlags";
import { moveShelfBooks } from "../../lib/shelfDrag";
import { useBookStore } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";
import { BOOK_MATERIAL } from "../book/bookAppearance";
import { getBookTextureUrls } from "../book/bookTextures";
import type { BookPose } from "../tour/tourStages";
import CollectionBlur from "./CollectionBlur";
import PictureFrame from "./PictureFrame";
import { progressionConfig } from "./progressionConfig";
import ShelfBookDissolve from "./ShelfBookDissolve";
import Shelves from "./Shelves";
import {
	type ArrangedBook,
	arrangedBookPose,
	arrangedBooksBounds,
	arrangeShelfBooks,
} from "./shelfArrangement";
import {
	BOOKS_SHELF_LEVEL,
	layoutShelfBooks,
	type ShelfBook,
} from "./shelfBooks";
import { useShelfBookDrag } from "./useShelfBookDrag";

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
	onEdit?: (id: string, position: { x: number; y: number }) => void;
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
			createBookLongPress((pointer) => {
				if (!editCallback.current) return;
				editCallback.current(book.id, {
					x: pointer.clientX,
					y: pointer.clientY,
				});
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
	onBookEdit,
	hiddenBookId,
	returningBookId,
	blurredBookIds = [],
	hiddenBookIds = [],
	deletingBooks = {},
	onDeleteComplete,
}: {
	onBookSelect?: (id: string, pose: BookPose) => void;
	onBookEdit?: (id: string, position: { x: number; y: number }) => void;
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
	const pictureFrameVisible = useShelfControlsStore(
		(state) => state.pictureFrameVisible,
	);
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
	// Keep receivers still while dragging so the drop target does not move away.
	const visible = placements.filter(
		({ book }) =>
			book.id !== hiddenBookId &&
			book.id !== returningBookId &&
			!hiddenBookIds.includes(book.id),
	);
	const stackTarget = drag?.drop.stackOnId
		? placements.find((entry) => entry.book.id === drag.drop.stackOnId)
		: undefined;
	const targetPreview = stackTarget
		? dropPlacements.find((entry) => entry.book.id === stackTarget.book.id)
		: undefined;
	const dropPreview = drag
		? dropPlacements
				.filter((entry) => drag.ids.includes(entry.book.id))
				.map((entry) =>
					stackTarget && targetPreview
						? {
								...entry,
								position: entry.position.map(
									(value, axis) =>
										value +
										stackTarget.position[axis] -
										targetPreview.position[axis],
								) as [number, number, number],
							}
						: entry,
				)
		: [];

	return (
		<>
			<Shelves fixedLevel={BOOKS_SHELF_LEVEL}>
				{SHOW_PICTURE_FRAME && pictureFrameVisible && <PictureFrame />}
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
								onSelect={
									editing
										? (id) => {
												selectBook(id);
												useBookStore.getState().selectBook(id);
											}
										: onBookSelect
								}
								onEdit={
									canEdit
										? (id, position) =>
												onBookEdit?.(id, position) ??
												(useTourStore.getState().previewBook(id),
												useShelfControlsStore.getState().openBookEditor(id))
										: undefined
								}
								blurred={blurredBookIds.includes(placement.book.id)}
								deleteStartedAt={deletingBooks[placement.book.id]}
								onDeleteComplete={onDeleteComplete}
							/>
						</Suspense>
					</AnimatedPlacement>
				))}
			</Shelves>
			{editing && !drag && <ShelfAnnotations placements={visible} />}
			{drag?.moved && (
				<ShelfDropPreview
					placements={dropPreview}
					shelf={drag.drop.shelf}
					stacking={Boolean(stackTarget)}
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
	});
	return (
		<group
			ref={ref}
			position={initial.position}
			rotation={initial.rotation}
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
	stacking,
}: {
	placements: ArrangedBook[];
	shelf: number;
	stacking: boolean;
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
					{stacking
						? "Release to stack on top"
						: `Shelf ${4 - shelf} · Release to place`}
				</span>
			</Html>
		</group>
	);
}

function ShelfAnnotations({ placements }: { placements: ArrangedBook[] }) {
	const { document, selectedIds, activeStackId, selectGroup } =
		useShelfControlsStore();
	const selected = placements.filter(({ book }) =>
		selectedIds.includes(book.id),
	);
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
				const radius = Math.min(
					0.12,
					(box.max.x - box.min.x) / 2,
					(box.max.y - box.min.y) / 2,
				);
				const corners = [
					{ x: box.min.x + radius, y: box.min.y + radius, start: Math.PI },
					{
						x: box.max.x - radius,
						y: box.min.y + radius,
						start: Math.PI * 1.5,
					},
					{ x: box.max.x - radius, y: box.max.y - radius, start: 0 },
					{ x: box.min.x + radius, y: box.max.y - radius, start: Math.PI / 2 },
				];
				const points: [number, number, number][] = corners.flatMap(
					({ x, y, start }) =>
						Array.from({ length: 5 }, (_, index) => {
							const angle = start + (Math.PI / 2) * (index / 4);
							return [
								x + Math.cos(angle) * radius,
								y + Math.sin(angle) * radius,
								z,
							] as [number, number, number];
						}),
				);
				points.push(points[0]);
				const stack = group.id === activeStackId;
				return (
					<group key={group.key}>
						<Line
							points={points}
							color={stack ? "#f5d6a0" : "#b7bac9"}
							lineWidth={stack ? 1.5 : 1}
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
								<div className="shelf-group-label">
									<button
										type="button"
										className="shelf-group-select"
										onClick={() => selectGroup(group.id)}
									>
										{group.name} · {group.bookIds.length}
									</button>
									<button
										type="button"
										className="shelf-group-detach"
										aria-label={`Detach ${group.name}`}
										title="Detach books"
										onClick={(event) => {
											event.stopPropagation();
											selectGroup(group.id);
											useShelfControlsStore.getState().ungroup();
										}}
									>
										<Unlink size={12} aria-hidden="true" />
									</button>
								</div>
							</Html>
						)}
					</group>
				);
			})}
		</>
	);
}
