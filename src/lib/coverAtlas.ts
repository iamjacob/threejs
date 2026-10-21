import manifest from "./coverAtlas.json";

export type AtlasRect = [number, number, number, number];
export type CoverAtlasRegion = {
	x: number;
	y: number;
	width: number;
	height: number;
	offset: number[];
	repeat: number[];
};
const regions: Record<string, CoverAtlasRegion> = manifest.regions;

export const COVER_ATLAS_PATH: string = manifest.path;
export const COVER_ATLAS_SIZE: number = manifest.size;
export const COVER_ATLAS_REGIONS: Record<string, CoverAtlasRegion> = regions;
export const FULL_RECT: AtlasRect = [0, 0, 1, 1];

/** UV rectangle (offset.xy, repeat.xy) of a source cover inside the atlas. */
export function coverAtlasRect(path: string): AtlasRect | undefined {
	const region = regions[path];
	if (!region) return undefined;
	const [u, v] = region.offset;
	const [w, h] = region.repeat;
	return [u, v, w, h];
}

/** True when every face of a cover can be drawn from the build-time atlas. */
export function coverInAtlas(cover: {
	front: string;
	back: string;
	spine: string;
}) {
	return (
		cover.front in regions && cover.back in regions && cover.spine in regions
	);
}

/** Source paths that are not in the build-time atlas. */
export function coverFacesOutsideAtlas(cover: {
	front: string;
	back: string;
	spine: string;
}) {
	return [cover.front, cover.back, cover.spine].filter(
		(path) => Boolean(path) && !(path in regions),
	);
}
