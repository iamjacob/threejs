export const SHELF_INNER_RADIUS = 7;
export const SHELF_OUTER_RADIUS = 8;
export const SHELF_THICKNESS = 0.08;
export const SHELF_SPACING = 1;
// One shelf interval represents 30 cm; all three book axes use the same scale.
export const CENTIMETERS_PER_WORLD_UNIT = 30;
export const BOOKS_SHELF_LEVEL = 4;

export type ShelfBook = {
	id: string;
	title: string;
	author: string;
	pages: number;
	pdf?: string;
	cover: { front: string; back: string; spine: string };
	dimensions: [number, number, number];
};

export function getShelfBooks(entries: unknown[]): ShelfBook[] {
	return entries.flatMap((entry) => {
		if (!entry || typeof entry !== "object") return [];
		const { title, isbn, author, pages, pdf, coverImage, size } = entry as {
			title?: string;
			isbn?: string;
			author?: string;
			pages?: number;
			pdf?: string;
			coverImage?: ShelfBook["cover"][];
			size?: { width: number; height: number; thickness: number };
		};
		const cover = Array.isArray(coverImage) ? coverImage[0] : undefined;
		if (
			!title ||
			!cover ||
			![cover.front, cover.back, cover.spine].every(
				(path) => typeof path === "string" && path.startsWith("/blockchain/"),
			) ||
			!size ||
			![size.width, size.height, size.thickness].every(
				(value) => Number.isFinite(value) && value > 0,
			)
		)
			return [];
		return [
			{
				id: isbn || title,
				title,
				author: author ?? "",
				pages: typeof pages === "number" && pages > 0 ? Math.trunc(pages) : 120,
				pdf,
				cover,
				dimensions: [
					size.width / CENTIMETERS_PER_WORLD_UNIT,
					size.height / CENTIMETERS_PER_WORLD_UNIT,
					size.thickness / CENTIMETERS_PER_WORLD_UNIT,
				] as [number, number, number],
			},
		];
	});
}

export function layoutShelfBooks(books: ShelfBook[], fractions: number[]) {
	const rows = fractions.map(() => [] as ShelfBook[]);
	const shelves = fractions
		.flatMap((fraction, index) => (fraction > 0 ? [index] : []))
		.reverse();
	if (!shelves.length) return [];
	books.forEach((book, index) => {
		rows[shelves[index % shelves.length]].push(book);
	});
	const radius = SHELF_INNER_RADIUS + 0.4;
	const gap = 0.16;
	return rows.flatMap((row, shelfIndex) => {
		const width =
			row.reduce((sum, book) => sum + book.dimensions[0], 0) +
			Math.max(0, row.length - 1) * gap;
		let cursor = -width / 2;
		return row.map((book) => {
			const angle = -(cursor + book.dimensions[0] / 2) / radius;
			cursor += book.dimensions[0] + gap;
			return {
				book,
				shelfIndex,
				position: [
					Math.cos(angle) * radius,
					(shelfIndex - 1) * SHELF_SPACING +
						SHELF_THICKNESS +
						book.dimensions[1] / 2,
					-Math.sin(angle) * radius,
				] as [number, number, number],
				rotation: [0, angle - Math.PI / 2, 0] as [number, number, number],
			};
		});
	});
}
