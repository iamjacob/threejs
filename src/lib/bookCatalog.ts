import catalog from "../../public/blockchain/data.json";
import { getBookTextureUrls } from "../components/book/bookTextures";
import { getShelfBooks } from "../components/shelves/shelfBooks";

export const books = getShelfBooks(catalog).map((book) => ({
	...book,
	textureUrls: getBookTextureUrls(book.cover),
	demoPages: Math.min(120, book.pages),
	scale: {
		width: book.dimensions[0],
		height: book.dimensions[1],
		thickness: book.dimensions[2],
	},
}));

export type LibraryBook = (typeof books)[number];
