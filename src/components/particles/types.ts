export type RgbColor = [number, number, number];
export type ParticlePhase = "idle" | "forming" | "visible" | "shrinking";

export interface BookScale {
	width: number;
	height: number;
	thickness: number;
}

export interface BookCover {
	front?: string;
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

export interface ExtractedColor {
	color: RgbColor;
	percentage: number;
}

export interface ParticlePixel {
	x: number;
	y: number;
	z: number;
	color: RgbColor;
}

export interface ColorExtractionResult {
	colors: ExtractedColor[];
	palette: RgbColor[];
	pixelData: ParticlePixel[] | null;
}

export interface ParticleColors {
	palette: RgbColor[];
	percentages: number[];
	pixelData: ParticlePixel[] | null;
}
