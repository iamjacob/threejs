import catalog from "../../public/books.json";
import { getBookTextureUrls } from "../components/book/bookTextures";
import { getShelfBooks } from "../components/shelves/shelfBooks";

export const books = getShelfBooks(catalog).map((book) => ({
	...book,
	readDate: book.readDate ?? new Date(Date.UTC(2025, 0, 8) + booksReadOffset(book.id) * 21 * 86_400_000).toISOString().slice(0, 10),
	textureUrls: getBookTextureUrls(book.cover),
	demoPages: Math.min(120, book.pages),
	scale: {
		width: book.dimensions[0],
		height: book.dimensions[1],
		thickness: book.dimensions[2],
	},
}));

function booksReadOffset(id: string) {
	return Math.max(0, getShelfBooks(catalog).findIndex((book) => book.id === id));
}

export type LibraryBook = (typeof books)[number] & { scanPages?: {image:string;width:number;height:number}[] };
