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
	Quaternion,
	SRGBColorSpace,
	TextureLoader,
	Vector3,
} from "three";
import { books } from "../../lib/bookCatalog";
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

export const shelfBooks = books;
const placements = layoutShelfBooks(
	shelfBooks,
	progressionConfig.levels[BOOKS_SHELF_LEVEL].shelves,
);
export const tallestShelfBook = Math.max(
	...shelfBooks.map((book) => book.dimensions[1]),
	0,
);

export function shelfBookPose(id: string): BookPose {
	const placement =
		placements.find(({ book }) => book.id === id) ?? placements[0];
	const angle = placement.rotation[1] + Math.PI / 2;
	return {
		position: [
			placement.position[2],
			placement.position[1] - 0.8,
			-placement.position[0],
		],
		quaternion: [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)],
	};
}

function CollectionBook({
	book,
	onSelect,
	blurred,
	deleteStartedAt,
	onDeleteComplete,
}: {
	book: ShelfBook;
	onSelect?: (id: string, pose: BookPose) => void;
	blurred: boolean;
	deleteStartedAt?: number;
	onDeleteComplete?: (id: string) => void;
}) {
	const mesh = useRef<Mesh>(null);
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
		document.body.style.cursor = "pointer";
		return () => {
			document.body.style.cursor = "";
		};
	}, [hovered, onSelect, deleteStartedAt]);
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
				onPointerOut={() => setHovered(false)}
				onClick={(event: ThreeEvent<MouseEvent>) => {
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
	return (
		<Shelves fixedLevel={BOOKS_SHELF_LEVEL}>
			{blurredBookIds.length > 0 && (
				<CollectionBlur
					placements={placements.filter(
						({ book }) =>
							blurredBookIds.includes(book.id) &&
							book.id !== hiddenBookId &&
							!hiddenBookIds.includes(book.id) &&
							book.id !== returningBookId,
					)}
				/>
			)}
			{placements
				.filter(
					({ book }) =>
						book.id !== hiddenBookId &&
						book.id !== returningBookId &&
						!hiddenBookIds.includes(book.id),
				)
				.map(({ book, position, rotation, shelfIndex }) => (
					<group
						key={book.id}
						position={position}
						rotation={rotation}
						userData={{ shelfIndex }}
					>
						<Suspense fallback={null}>
							<CollectionBook
								book={book}
								onSelect={onBookSelect}
								blurred={blurredBookIds.includes(book.id)}
								deleteStartedAt={deletingBooks[book.id]}
								onDeleteComplete={onDeleteComplete}
							/>
						</Suspense>
					</group>
				))}
		</Shelves>
	);
}
