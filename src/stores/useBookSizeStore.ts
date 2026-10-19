import { create } from "zustand";

export type BookSizeCm = {
	height: number;
	width: number;
	thickness: number;
};
type SizeEntry = {
	size: BookSizeCm;
	initial: BookSizeCm;
	overridden: boolean;
	source: string;
};
type BookSizeState = {
	unit: "cm" | "in";
	entries: Record<string, SizeEntry>;
	setUnit: (unit: "cm" | "in") => void;
	applyEnrichment: (id: string, size: BookSizeCm, source: string) => void;
	setSize: (id: string, size: Partial<BookSizeCm>) => void;
	reset: (id: string) => void;
	getSize: (id: string) => SizeEntry;
};

export const DEFAULT_BOOK_SIZE_CM: BookSizeCm = {
	height: 21,
	width: 14.8,
	thickness: 2.4,
};
export const BOOK_SIZE_LIMITS_CM: Record<keyof BookSizeCm, [number, number]> = {
	height: [10, 40],
	width: [8, 32],
	thickness: [0.4, 8],
};
/** Scene scale used across shelves and the scanner: 30 cm per world unit. */
export const CM_PER_WORLD_UNIT = 30;
const STORAGE_KEY = "boooks-book-sizes-v1";

export function formatMeasurement(cm: number, unit: "cm" | "in") {
	if (unit === "cm") return `${cm.toFixed(1).replace(/\.0$/, "")} cm`;
	const glyphs = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"];
	const eighths = Math.round((cm / 2.54) * 8);
	const whole = Math.floor(eighths / 8);
	const fraction = glyphs[eighths % 8];
	return `${whole ? `${whole}${fraction ? ` ${fraction}` : ""}` : fraction || "0"} in`;
}

export function clampBookSize(size: BookSizeCm): BookSizeCm {
	const clamp = (axis: keyof BookSizeCm) =>
		Math.min(
			BOOK_SIZE_LIMITS_CM[axis][1],
			Math.max(BOOK_SIZE_LIMITS_CM[axis][0], size[axis]),
		);
	return {
		height: clamp("height"),
		width: clamp("width"),
		thickness: clamp("thickness"),
	};
}

function loadEntries(): Record<string, SizeEntry> {
	try {
		const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
		return value && typeof value === "object" ? value : {};
	} catch {
		return {};
	}
}

function saveEntries(entries: Record<string, SizeEntry>) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
	} catch {
		// Keep current-session size edits if storage is disabled.
	}
}

function defaultEntry(): SizeEntry {
	return {
		size: { ...DEFAULT_BOOK_SIZE_CM },
		initial: { ...DEFAULT_BOOK_SIZE_CM },
		overridden: false,
		source: "Default estimate",
	};
}

function validSize(size: BookSizeCm) {
	return (
		Number.isFinite(size.height) &&
		Number.isFinite(size.width) &&
		Number.isFinite(size.thickness) &&
		size.height >= BOOK_SIZE_LIMITS_CM.height[0] &&
		size.height <= BOOK_SIZE_LIMITS_CM.height[1] &&
		size.width >= BOOK_SIZE_LIMITS_CM.width[0] &&
		size.width <= BOOK_SIZE_LIMITS_CM.width[1] &&
		size.thickness >= BOOK_SIZE_LIMITS_CM.thickness[0] &&
		size.thickness <= BOOK_SIZE_LIMITS_CM.thickness[1]
	);
}

export const useBookSizeStore = create<BookSizeState>((set, get) => ({
	unit: "cm",
	entries: loadEntries(),
	setUnit: (unit) => set({ unit }),
	getSize: (id) => get().entries[id] ?? defaultEntry(),
	applyEnrichment: (id, size, source) => {
		if (!validSize(size)) return;
		set((state) => {
			const previous = state.entries[id] ?? defaultEntry();
			const entry: SizeEntry = {
				size: previous.overridden ? previous.size : { ...size },
				initial: { ...size },
				overridden: previous.overridden,
				source,
			};
			const entries = { ...state.entries, [id]: entry };
			saveEntries(entries);
			return { entries };
		});
	},
	setSize: (id, patch) =>
		set((state) => {
			const current = state.entries[id] ?? defaultEntry();
			const size = { ...current.size, ...patch };
			if (!validSize(size)) return state;
			const entries = {
				...state.entries,
				[id]: {
					...current,
					size,
					overridden: true,
					source: "Adjusted manually",
				},
			};
			saveEntries(entries);
			return { entries };
		}),
	reset: (id) =>
		set((state) => {
			const current = state.entries[id] ?? defaultEntry();
			const entries = {
				...state.entries,
				[id]: { ...current, size: { ...current.initial }, overridden: false },
			};
			saveEntries(entries);
			return { entries };
		}),
}));
