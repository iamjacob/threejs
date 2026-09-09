import { useLoader, useThree } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import { SRGBColorSpace, type Texture, TextureLoader } from "three";
import { books } from "../../lib/bookCatalog";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useSelectedBook } from "../../stores/useBookStore";
import { BOOK_MATERIAL } from "../book/bookAppearance";
import { getBookTextureUrls } from "../book/bookTextures";
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

function CollectionBook({ book }: { book: ShelfBook }) {
	const selectedBook = useSelectedBook();
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
			{selectedBook.id === book.id && (
				<mesh
					name="selected-book-marker"
					position={[0, -book.dimensions[1] / 2 + 0.003, 0]}
				>
					<boxGeometry
						args={[book.dimensions[0] + 0.06, 0.008, book.dimensions[2] + 0.06]}
					/>
					<meshBasicMaterial color="#ed3541" />
				</mesh>
			)}
			<mesh name={`shelf-book-${book.id}`} userData={{ title: book.title }}>
				<boxGeometry args={book.dimensions} />
				{textures.map((texture, index) => (
					<meshStandardMaterial
						key={
							["fore-edge", "spine", "top", "bottom", "front", "back"][index]
						}
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

export default function Bookshelves() {
	return (
		<Shelves fixedLevel={BOOKS_SHELF_LEVEL}>
			{placements.map(({ book, position, rotation, shelfIndex }) => (
				<group
					key={book.id}
					position={position}
					rotation={rotation}
					userData={{ shelfIndex }}
				>
					<Suspense fallback={null}>
						<CollectionBook book={book} />
					</Suspense>
				</group>
			))}
		</Shelves>
	);
}
