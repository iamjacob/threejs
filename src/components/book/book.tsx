import { BOOK_DIMENSIONS, useBookMaterials } from "./bookAppearance";

export default function Book() {
	const materials = useBookMaterials();
	return (
		<mesh name="book" material={materials}>
			<boxGeometry args={BOOK_DIMENSIONS} />
		</mesh>
	);
}
