import type { BookCover } from "../book/bookTextures";

export type ParticlePhase = "idle" | "forming" | "visible" | "shrinking";

export interface BookScale {
	width: number;
	height: number;
	thickness: number;
}

export interface BookData {
	id?: string;
	isbn?: string;
	title?: string;
	cover?: string | BookCover;
	thumbnail?: string;
	image?: string;
	scale?: Partial<BookScale>;
}
