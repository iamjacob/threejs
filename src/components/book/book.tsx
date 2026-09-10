import type { LibraryBook } from "../../lib/bookCatalog";
import { useSelectedBook } from "../../stores/useBookStore";
import { useBookMaterials } from "./bookAppearance";

export default function Book({
	book: providedBook,
}: {
	book?: LibraryBook;
} = {}) {
	const selectedBook = useSelectedBook();
	const book = providedBook ?? selectedBook;
	const materials = useBookMaterials(book.textureUrls);
	return (
		<mesh name="book" material={materials}>
			<boxGeometry args={book.dimensions} />
		</mesh>
	);
}
