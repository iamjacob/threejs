import type { LibraryBook } from "./bookCatalog";
/** Stable identities let repeated copies be arranged independently. */
export function loopLibrary(
	books: LibraryBook[],
	level: number,
): LibraryBook[] {
	const originals = books.filter((book) => !book.loopSourceId);
	if (level !== 10) return originals;
	return [
		...originals,
		...Array.from({ length: 239 }, (_, loop) =>
			originals.map((book) => ({
				...book,
				id: `shelf-loop-${loop + 1}:${book.id}`,
				loopSourceId: book.id,
			})),
		).flat(),
	];
}
