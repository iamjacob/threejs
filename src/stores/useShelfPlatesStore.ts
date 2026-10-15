import { create } from "zustand";

const STORAGE_KEY = "boooks-shelf-plates-v1";
export function normalizeShelfPlates(value: unknown): string[] {
	return Array.from({ length: 4 }, (_, index) =>
		Array.isArray(value) && typeof value[index] === "string"
			? value[index].trim().slice(0, 36)
			: "",
	);
}
export function loadShelfPlates(): string[] {
	try {
		return normalizeShelfPlates(
			JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"),
		);
	} catch {
		return normalizeShelfPlates([]);
	}
}
export const useShelfPlatesStore = create<{
	labels: string[];
	editorOpen: boolean;
	openEditor: () => void;
	closeEditor: () => void;
	save: (labels: string[]) => void;
}>((set) => ({
	labels: loadShelfPlates(),
	editorOpen: false,
	openEditor: () => set({ editorOpen: true }),
	closeEditor: () => set({ editorOpen: false }),
	save: (labels) => {
		const next = normalizeShelfPlates(labels);
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} catch {
			/* Storage may be unavailable. */
		}
		set({ labels: next, editorOpen: false });
	},
}));
