export const BOOK_DIMENSIONS: [number, number, number] = [0.7, 1, 0.1];
export const BOOK_COVER_PATH =
	"/blockchain/m/i/mit_liv_med_fangekoret-00000001/cover";

export interface BookCover {
	front?: string;
	back?: string;
	spine?: string;
	foreEdge?: string;
	top?: string;
	bottom?: string;
}

// Three.js BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z.
export function getBookTextureUrls(cover?: string | BookCover, front?: string) {
	const faces = typeof cover === "string" ? { front: cover } : cover;
	return [
		faces?.foreEdge ?? "/experience/books/assets/booktextureSide.webp",
		faces?.spine ?? `${BOOK_COVER_PATH}/spine.webp`,
		faces?.top ?? "/experience/books/assets/booktexture.webp",
		faces?.bottom ?? "/experience/books/assets/booktexture.webp",
		faces?.front ?? front ?? `${BOOK_COVER_PATH}/front.webp`,
		faces?.back ?? `${BOOK_COVER_PATH}/back.webp`,
	];
}

export const BOOK_TEXTURE_URLS = getBookTextureUrls();
