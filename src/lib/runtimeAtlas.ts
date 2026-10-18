import { CanvasTexture, SRGBColorSpace } from "three";
import { create } from "zustand";
import { atlasUvTransform, packAtlas } from "./atlasPacking";
import type { AtlasRect } from "./coverAtlas";

/**
 * Covers that only exist on the device (scanned books, data: or blob: URLs)
 * cannot be in the build-time atlas. They are downscaled and packed into one
 * canvas texture at runtime so scanned books render instanced like the rest.
 */
const MAX_FACE_HEIGHT = 384;
const MAX_ATLAS_SIZE = 2048;
const PADDING = 2;

type RuntimeAtlasState = {
	texture: CanvasTexture | null;
	rects: Record<string, AtlasRect>;
	/** Sources that did not fit or failed to decode; they keep their own mesh. */
	rejected: Set<string>;
	version: number;
};

export const useRuntimeAtlas = create<RuntimeAtlasState>(() => ({
	texture: null,
	rects: {},
	rejected: new Set(),
	version: 0,
}));

export function isRuntimeCoverSource(source: string) {
	return source.startsWith("data:") || source.startsWith("blob:");
}

export function runtimeAtlasRect(source: string): AtlasRect | undefined {
	return useRuntimeAtlas.getState().rects[source];
}

const decoded = new Map<
	string,
	Promise<ImageBitmap | HTMLImageElement | null>
>();
function decode(source: string) {
	let pending = decoded.get(source);
	if (!pending) {
		pending = (async () => {
			try {
				const response = await fetch(source);
				const blob = await response.blob();
				return await createImageBitmap(blob);
			} catch {
				try {
					const image = new Image();
					image.src = source;
					await image.decode();
					return image;
				} catch {
					return null;
				}
			}
		})();
		decoded.set(source, pending);
	}
	return pending;
}

let building: Promise<void> | null = null;
let queued = false;

/**
 * Ensure every given source is in the runtime atlas, rebuilding it once per
 * batch. Safe to call repeatedly; concurrent calls coalesce.
 */
export function ensureRuntimeAtlas(sources: string[]) {
	const state = useRuntimeAtlas.getState();
	const missing = sources.filter(
		(source) =>
			isRuntimeCoverSource(source) &&
			!(source in state.rects) &&
			!state.rejected.has(source),
	);
	if (!missing.length) return building ?? Promise.resolve();
	if (building) {
		queued = true;
		return building;
	}
	building = rebuild([...Object.keys(state.rects), ...missing]).finally(() => {
		building = null;
		if (queued) {
			queued = false;
			void ensureRuntimeAtlas(sources);
		}
	});
	return building;
}

async function rebuild(sources: string[]) {
	const unique = [...new Set(sources)];
	const images = await Promise.all(
		unique.map(async (source) => ({ source, image: await decode(source) })),
	);
	const inputs: { id: string; width: number; height: number }[] = [];
	const rejected = new Set(useRuntimeAtlas.getState().rejected);
	for (const { source, image } of images) {
		if (!image || !image.width || !image.height) {
			rejected.add(source);
			continue;
		}
		const scale = Math.min(1, MAX_FACE_HEIGHT / image.height);
		inputs.push({
			id: source,
			width: Math.max(1, Math.round(image.width * scale)),
			height: Math.max(1, Math.round(image.height * scale)),
		});
	}
	let layout: ReturnType<typeof packAtlas> | null = null;
	// Drop the newest covers until everything fits; those keep their own mesh.
	while (inputs.length && !layout) {
		try {
			layout = packAtlas(inputs, { padding: PADDING, maxSize: MAX_ATLAS_SIZE });
		} catch {
			const dropped = inputs.pop();
			if (dropped) rejected.add(dropped.id);
		}
	}
	if (!layout) {
		useRuntimeAtlas.setState((state) => ({
			rejected,
			version: state.version + 1,
		}));
		return;
	}
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = layout.size;
	const context = canvas.getContext("2d");
	if (!context) return;
	const byId = new Map(images.map((entry) => [entry.source, entry.image]));
	const rects: Record<string, AtlasRect> = {};
	for (const region of layout.regions) {
		const image = byId.get(region.id);
		if (!image) continue;
		context.drawImage(image, region.x, region.y, region.width, region.height);
		const { offset, repeat } = atlasUvTransform(region, layout.size);
		rects[region.id] = [offset[0], offset[1], repeat[0], repeat[1]];
	}
	const previous = useRuntimeAtlas.getState().texture;
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	texture.flipY = true;
	texture.generateMipmaps = true;
	texture.needsUpdate = true;
	useRuntimeAtlas.setState((state) => ({
		texture,
		rects,
		rejected,
		version: state.version + 1,
	}));
	previous?.dispose();
}
