import type { LibraryBook } from "../../lib/bookCatalog";
import { getBookTextureUrls } from "../book/bookTextures";

export type CroppedFace = { image: string; width: number; height: number };
export type BookScan = {
	id?: string;
	photos?: import("./scanDrafts").ScanPhoto[];
	title: string;
	subtitle?: string;
	author?: string;
	front: CroppedFace;
	spine?: CroppedFace;
	back?: CroppedFace;
};

export async function scannedBook(scan: BookScan): Promise<LibraryBook> {
	const image = new Image();
	image.src = scan.front.image;
	await image.decode();
	const sample = document.createElement("canvas");
	sample.width = sample.height = 1;
	const context = sample.getContext("2d");
	if (!context) throw new Error("Image processing is unavailable.");
	context.drawImage(image, 0, 0, 1, 1);
	const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
	const title = scan.title.trim();
	const makeFace = (spine: boolean) => {
		const canvas = document.createElement("canvas");
		canvas.width = spine ? 128 : 512;
		canvas.height = 768;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Image processing is unavailable.");
		ctx.fillStyle = `rgb(${r} ${g} ${b})`;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle =
			r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#171820" : "#fffdf5";
		ctx.font = "600 36px system-ui";
		if (spine) {
			ctx.translate(76, 40);
			ctx.rotate(Math.PI / 2);
			ctx.fillText(title, 0, 0, 680);
		} else {
			ctx.fillText(title, 36, 74, 440);
		}
		return canvas.toDataURL("image/webp", 0.9);
	};
	const ratio = scan.front.width / scan.front.height;
	const height = Math.min(0.72, 0.8 / ratio);
	const width = height * ratio;
	const thickness = 0.055;
	const cover = {
		front: scan.front.image,
		spine: scan.spine?.image ?? makeFace(true),
		back: scan.back?.image ?? makeFace(false),
	};
	const scanPages = scan.photos
		?.filter(
			(photo) => !["front", "spine", "back", "dustjacket"].includes(photo.tag),
		)
		.map(
			(photo) =>
				photo.crop ?? {
					image: photo.image,
					width: scan.front.width,
					height: scan.front.height,
				},
		);
	return {
		scanPages,
		id: scan.id ?? `scan-${crypto.randomUUID()}`,
		title,
		author: scan.author?.trim() ?? "",
		subtitle: scan.subtitle?.trim() ?? "",
		pages: scanPages?.length || 180,
		readDate: new Date().toISOString().slice(0, 10),
		demoPages: 120,
		cover,
		textureUrls: getBookTextureUrls(cover),
		dimensions: [width, height, thickness],
		scale: { width, height, thickness },
	};
}

const DB_NAME = "boooks-scans";
async function database(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () =>
			request.result.createObjectStore("books", { keyPath: "id" });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function saveScannedBook(book: LibraryBook) {
	const db = await database();
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction("books", "readwrite");
			transaction.objectStore("books").put(book);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error);
		});
	} finally {
		db.close();
	}
}

export async function loadScannedBooks(): Promise<LibraryBook[]> {
	const db = await database();
	try {
		return await new Promise<LibraryBook[]>((resolve, reject) => {
			const request = db.transaction("books").objectStore("books").getAll();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	} finally {
		db.close();
	}
}
