import { type ThreeEvent, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
	Quaternion,
	SRGBColorSpace,
	type Texture,
	TextureLoader,
	Vector3,
} from "three";
import { books } from "../../lib/bookCatalog";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { BOOK_MATERIAL } from "../book/bookAppearance";
import { getBookTextureUrls } from "../book/bookTextures";
import type { BookPose } from "../tour/tourStages";
import CollectionBlur from "./CollectionBlur";
import { progressionConfig } from "./progressionConfig";
import Shelves from "./Shelves";
import {
	BOOKS_SHELF_LEVEL,
	layoutShelfBooks,
	type ShelfBook,
} from "./shelfBooks";

// Keep the original scans on disk; limit GPU texture memory for the collection.
class ShelfTextureLoader extends TextureLoader {
	load(
		...[url, onLoad, onProgress, onError]: Parameters<TextureLoader["load"]>
	) {
		return super.load(
			url,
			(texture) => {
				const image = texture.image as HTMLImageElement;
				const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
				if (scale < 1) {
					const canvas = document.createElement("canvas");
					canvas.width = Math.max(1, Math.round(image.width * scale));
					canvas.height = Math.max(1, Math.round(image.height * scale));
					const context = canvas.getContext("2d");
					if (context) {
						context.drawImage(image, 0, 0, canvas.width, canvas.height);
						(texture as Texture<HTMLImageElement | HTMLCanvasElement>).image =
							canvas;
					}
				}
				texture.colorSpace = SRGBColorSpace;
				onLoad?.(texture);
			},
			onProgress,
			onError,
		);
	}
}

// An instance keeps the shelf texture cache separate from full-resolution demo textures.
const shelfTextureLoader = new ShelfTextureLoader();

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
}: {
	book: ShelfBook;
	onSelect?: (id: string, pose: BookPose) => void;
	blurred: boolean;
}) {
	const [hovered, setHovered] = useState(false);
	useEffect(() => {
		if (!hovered || !onSelect) return;
		document.body.style.cursor = "pointer";
		return () => {
			document.body.style.cursor = "";
		};
	}, [hovered, onSelect]);
	const urls = useMemo(
		() => getBookTextureUrls(book.cover).map((url) => publicAssetUrl(url)),
		[book.cover],
	);
	const textures = useLoader(shelfTextureLoader, urls);
	const anisotropy = useThree((state) =>
		Math.min(4, state.gl.capabilities.getMaxAnisotropy()),
	);
	return (
		<group>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: Canvas book; the Open book button offers a keyboard alternative. */}
			<mesh
				name={`shelf-book-${book.id}`}
				userData={{ title: book.title, bookId: book.id, blurred }}
				onPointerOver={(event) => {
					if (onSelect) {
						event.stopPropagation();
						setHovered(true);
					}
				}}
				onPointerOut={() => setHovered(false)}
				onClick={(event: ThreeEvent<MouseEvent>) => {
					if (!onSelect || event.delta > 5) return;
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
				{textures.map((texture, index) => (
					<meshStandardMaterial
						key={["edge", "spine", "top", "bottom", "front", "back"][index]}
						attach={`material-${index}`}
						{...BOOK_MATERIAL}
						map={texture}
						map-anisotropy={anisotropy}
					/>
				))}
			</mesh>
		</group>
	);
}

export default function Bookshelves({
	onBookSelect,
	hiddenBookId,
	returningBookId,
	blurredBookIds = [],
}: {
	onBookSelect?: (id: string, pose: BookPose) => void;
	hiddenBookId?: string;
	returningBookId?: string | null;
	blurredBookIds?: string[];
} = {}) {
	return (
		<Shelves fixedLevel={BOOKS_SHELF_LEVEL}>
			{blurredBookIds.length > 0 && (
				<CollectionBlur
					placements={placements.filter(
						({ book }) =>
							blurredBookIds.includes(book.id) &&
							book.id !== hiddenBookId &&
							book.id !== returningBookId,
					)}
				/>
			)}
			{placements
				.filter(
					({ book }) => book.id !== hiddenBookId && book.id !== returningBookId,
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
							/>
						</Suspense>
					</group>
				))}
		</Shelves>
	);
}
