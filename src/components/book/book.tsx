import { useSelectedBook } from "../../stores/useBookStore";
import { useBookMaterials } from "./bookAppearance";

export default function Book() {
	const book = useSelectedBook();
	const materials = useBookMaterials();
	return (
		<mesh name="book" material={materials}>
			<boxGeometry args={book.dimensions} />
		</mesh>
	);
}
