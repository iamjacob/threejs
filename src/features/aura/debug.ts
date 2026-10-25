export type AuraDebugBook = {
	id: string;
	title: string;
	x: number;
	y: number;
	w: number;
	h: number;
};

export type AuraDebugState = {
	focusedId: string | null;
	shelf: string;
	style: string;
	auras: number;
	vis: number;
	scrolling: boolean;
	title: string;
	status: string;
	friends: string;
	books: AuraDebugBook[];
	slots: { bookId: string | null; b: number }[];
};

export const auraDebug: AuraDebugState = {
	focusedId: null,
	shelf: "me",
	style: "aurora",
	auras: 0,
	vis: 0,
	scrolling: false,
	title: "",
	status: "",
	friends: "",
	books: [],
	slots: [],
};

declare global {
	interface Window {
		__aura?: { state: () => AuraDebugState };
	}
}

export function installAuraDebug() {
	if (typeof window === "undefined") return;
	window.__aura = { state: () => auraDebug };
}
