import variants from "./bookImageVariants.json";

export type BookImageLevel = "low" | "medium" | "detail" | "original";
type ImageVariant = {
	path: string;
	width: number;
	height: number;
	bytes: number;
};
const images: Record<string, Record<BookImageLevel, ImageVariant>> = variants;

export function bookImagePath(path: string, level: BookImageLevel = "detail") {
	return images[path]?.[level].path ?? path;
}

export function bookImageHeight(path: string, level: BookImageLevel) {
	return images[path]?.[level].height ?? 1024;
}
