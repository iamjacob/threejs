import type { CroppedFace } from "./scannedBook";
import type { Point } from "./perspective";
export const photoTags = {
	front: "Front cover",
	spine: "Spine",
	back: "Back cover",
	page: "Page",
	dustjacket: "Dust jacket",
	index: "Index",
	copyright: "Copyright page",
	contents: "Table of contents",
	other: "Other",
} as const;
export type PhotoTag = keyof typeof photoTags;
export type ScanPhoto = {
	id: string;
	name: string;
	image: string;
	tag: PhotoTag;
	crop?: CroppedFace;
	points?: Point[];
};
export type ScanDraft = {
	id: string;
	title: string;
	photos: ScanPhoto[];
	faces: Partial<Record<"front" | "spine" | "back", CroppedFace>>;
	updated: number;
};
export const newScanDraft = (): ScanDraft => ({
	id: `scan-${crypto.randomUUID()}`,
	title: "",
	photos: [],
	faces: {},
	updated: Date.now(),
});
async function database(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const r = indexedDB.open("boooks-scan-drafts", 1);
		r.onupgradeneeded = () =>
			r.result.createObjectStore("drafts", { keyPath: "id" });
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});
}
export async function saveDraft(draft: ScanDraft) {
	const db = await database();
	try {
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction("drafts", "readwrite");
			tx.objectStore("drafts").put(draft);
			tx.oncomplete = () => resolve();
			tx.onerror = tx.onabort = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}
export async function loadDrafts(): Promise<ScanDraft[]> {
	const db = await database();
	try {
		return await new Promise((resolve, reject) => {
			const r = db.transaction("drafts").objectStore("drafts").getAll();
			r.onsuccess = () =>
				resolve(
					r.result.sort((a: ScanDraft, b: ScanDraft) => b.updated - a.updated),
				);
			r.onerror = () => reject(r.error);
		});
	} finally {
		db.close();
	}
}
export const photoData = (file: File): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
