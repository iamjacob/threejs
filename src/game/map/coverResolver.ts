import { getShelfBooks } from "../../components/shelves/shelfBooks";
import type { LibraryBookView } from "../../data/usecases/libraryBooks";
import { bookCatalog } from "../../lib/bookCatalog";
import type { TornadoSourceBook } from "../core/tornadoBooks.ts";

/**
 * Maps repository rows to the pure tornado input. Catalog covers resolve to the shared bundled
 * asset path (served by the prebuilt atlas, no network); scan covers resolve to the profile's own
 * FileStore blob key. Runs once per library load, never per frame.
 */
const catalogFront = new Map(
	getShelfBooks(bookCatalog).map((b) => [b.id, b.cover.front] as const),
);

export function toTornadoSource(row: LibraryBookView): TornadoSourceBook {
	let cover: TornadoSourceBook["cover"];
	if (row.source === "catalog" && row.catalogId) {
		const path = catalogFront.get(row.catalogId);
		if (path) cover = { kind: "asset", path };
	} else if (row.covers.front) {
		cover = {
			kind: "blob",
			key: row.covers.front.blobKey,
			mimeType: row.covers.front.mimeType,
		};
	}
	return {
		id: row.id,
		title: row.title,
		author: row.author,
		addedAt: row.addedAt,
		source: row.source,
		catalogId: row.catalogId,
		widthCm: row.widthCm,
		heightCm: row.heightCm,
		thicknessCm: row.thicknessCm,
		color: row.color,
		cover,
	};
}
