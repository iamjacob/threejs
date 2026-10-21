import { CanvasTexture, SRGBColorSpace } from "three";
import { create } from "zustand";
import { atlasUvTransform, packAtlas } from "./atlasPacking";
import {
	type AtlasRect,
	COVER_ATLAS_PATH,
	COVER_ATLAS_REGIONS,
} from "./coverAtlas";
import { publicAssetUrl } from "./publicAssetUrl";

/**
 * Unifies the build-time catalog cover atlas with device-local covers (scanned
 * books in IndexedDB, data:/blob: URLs, or any cover face outside the build
 * manifest) into a single big atlas texture (`material.map`) so all books draw
 * from one texture bind.
 */
const MAX_FACE_SIZE = 384;
const MAX_ATLAS_SIZE = 4096;
const PADDING = 2;

type DrawableImage = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

type RuntimeAtlasState = {
	texture: CanvasTexture | null;
	rects: Record<string, AtlasRect>;
	/** Local/extra sources currently packed into the unified atlas. */
	sources: Set<string>;
	/** Sources that did not fit or failed to decode; they keep their own mesh. */
	rejected: Set<string>;
	/** True once initial hydration (IndexedDB + unified atlas build) has completed. */
	ready: boolean;
	version: number;
};

export const useRuntimeAtlas = create<RuntimeAtlasState>(() => ({
	texture: null,
	rects: {},
	sources: new Set(),
	rejected: new Set(),
	ready: false,
	version: 0,
}));

export function isRuntimeCoverSource(source: string) {
	return Boolean(source) && !(source in COVER_ATLAS_REGIONS);
}

export function runtimeAtlasRect(source: string): AtlasRect | undefined {
	return useRuntimeAtlas.getState().rects[source];
}

let baseAtlasImage: DrawableImage | null = null;

/** Seed the already-loaded build-time cover atlas image so repacking skips a network fetch. */
export function setBaseAtlasImage(image: unknown) {
	if (
		image &&
		typeof image === "object" &&
		"width" in image &&
		"height" in image
	) {
		baseAtlasImage = image as DrawableImage;
	}
}

const decoded = new Map<string, Promise<DrawableImage | null>>();
function decode(source: string) {
	let pending = decoded.get(source);
	if (!pending) {
		pending = (async () => {
			if (typeof Image !== "undefined") {
				try {
					const image = new Image();
					image.crossOrigin = "anonymous";
					image.src = source;
					await image.decode();
					return image;
				} catch {
					/* Fall back to fetch + createImageBitmap below. */
				}
			}
			try {
				const response = await fetch(source);
				if (!response.ok) throw new Error("fetch failed");
				const blob = await response.blob();
				return await createImageBitmap(blob);
			} catch {
				return null;
			}
		})();
		decoded.set(source, pending);
	}
	return pending;
}

async function getBaseAtlasImage(): Promise<DrawableImage | null> {
	if (baseAtlasImage) return baseAtlasImage;
	const loaded = await decode(publicAssetUrl(COVER_ATLAS_PATH));
	if (loaded) baseAtlasImage = loaded;
	return baseAtlasImage;
}

let building: Promise<void> | null = null;
const queuedSources = new Set<string>();
let initialHydration: Promise<void> | null = null;
let initialHydrationDone = false;

/**
 * Register the startup task that loads local books from IndexedDB and packs
 * their covers into the unified atlas before the shelf first reveals.
 */
export function registerInitialAtlasHydration(task: () => Promise<void>) {
	if (!initialHydration) {
		initialHydration = (async () => {
			try {
				await Promise.all([getBaseAtlasImage(), task()]);
			} catch {
				/* Keep shelf working even if device storage is unavailable. */
			} finally {
				initialHydrationDone = true;
				useRuntimeAtlas.setState((state) => ({
					ready: true,
					version: state.version + 1,
				}));
			}
		})();
	}
	return initialHydration;
}

/**
 * Called by `InstancedBooks` during render inside `<Suspense>` so the initial
 * frame waits until both IndexedDB local books and the unified atlas texture
 * are ready, making all books (catalog + local) appear in the exact same frame.
 */
export function suspendUntilAtlasReady(sources: string[]) {
	if (initialHydration && !initialHydrationDone) {
		throw initialHydration;
	}
	const state = useRuntimeAtlas.getState();
	const missing = sources.filter(
		(source) =>
			isRuntimeCoverSource(source) &&
			!state.sources.has(source) &&
			!state.rejected.has(source),
	);
	if (missing.length > 0) {
		const pending = ensureRuntimeAtlas(sources);
		if (!state.ready) throw pending;
	} else if (building && !state.ready) {
		throw building;
	} else if (!state.ready) {
		useRuntimeAtlas.setState({ ready: true });
	}
}

/**
 * Ensure every given local/extra cover source is packed together with all
 * catalog covers into the single unified atlas texture, rebuilding once per
 * batch. Safe to call repeatedly; concurrent calls coalesce.
 */
export function ensureRuntimeAtlas(sources: string[]) {
	const state = useRuntimeAtlas.getState();
	const missing = sources.filter(
		(source) =>
			isRuntimeCoverSource(source) &&
			!state.sources.has(source) &&
			!state.rejected.has(source),
	);
	if (!missing.length) {
		if (
			!building &&
			(!initialHydration || initialHydrationDone) &&
			!state.ready
		) {
			useRuntimeAtlas.setState((current) => ({
				ready: true,
				version: current.version + 1,
			}));
		}
		return building ?? Promise.resolve();
	}
	if (building) {
		for (const source of missing) queuedSources.add(source);
		return building;
	}
	building = rebuild([...state.sources, ...missing]).finally(() => {
		building = null;
		if (queuedSources.size > 0) {
			const next = [...queuedSources];
			queuedSources.clear();
			void ensureRuntimeAtlas(next);
		}
	});
	return building;
}

async function rebuild(sources: string[]) {
	const unique = [...new Set(sources.filter(isRuntimeCoverSource))];
	const [baseImage, images] = await Promise.all([
		getBaseAtlasImage(),
		Promise.all(
			unique.map(async (source) => ({ source, image: await decode(source) })),
		),
	]);
	const localInputs: { id: string; width: number; height: number }[] = [];
	const rejected = new Set(useRuntimeAtlas.getState().rejected);
	for (const { source, image } of images) {
		if (!image || !image.width || !image.height) {
			rejected.add(source);
			continue;
		}
		const longest = Math.max(image.width, image.height);
		const scale = Math.min(1, MAX_FACE_SIZE / longest);
		localInputs.push({
			id: source,
			width: Math.max(1, Math.round(image.width * scale)),
			height: Math.max(1, Math.round(image.height * scale)),
		});
	}
	if (!localInputs.length) {
		useRuntimeAtlas.setState((state) => ({
			rejected,
			version: state.version + 1,
		}));
		return;
	}
	const baseInputs = baseImage
		? Object.entries(COVER_ATLAS_REGIONS).map(([id, region]) => ({
				id,
				width: region.width,
				height: region.height,
			}))
		: [];
	let layout: ReturnType<typeof packAtlas> | null = null;
	// Drop the newest local covers until everything fits; catalog covers stay intact.
	while (localInputs.length && !layout) {
		try {
			layout = packAtlas([...baseInputs, ...localInputs], {
				padding: PADDING,
				maxSize: MAX_ATLAS_SIZE,
			});
		} catch {
			const dropped = localInputs.pop();
			if (dropped) rejected.add(dropped.id);
		}
	}
	if (!layout || typeof document === "undefined") {
		useRuntimeAtlas.setState((state) => ({
			rejected,
			version: state.version + 1,
		}));
		return;
	}
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = layout.size;
	const context = canvas.getContext("2d", { alpha: false });
	if (!context) return;
	const byId = new Map(images.map((entry) => [entry.source, entry.image]));
	const rects: Record<string, AtlasRect> = {};
	const packedSources = new Set<string>();
	for (const region of layout.regions) {
		const builtRegion = COVER_ATLAS_REGIONS[region.id];
		if (builtRegion && baseImage) {
			context.drawImage(
				baseImage,
				builtRegion.x,
				builtRegion.y,
				builtRegion.width,
				builtRegion.height,
				region.x,
				region.y,
				region.width,
				region.height,
			);
		} else {
			const image = byId.get(region.id);
			if (!image) continue;
			context.drawImage(image, region.x, region.y, region.width, region.height);
			packedSources.add(region.id);
		}
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
		sources: packedSources,
		rejected,
		ready: !initialHydration || initialHydrationDone ? true : state.ready,
		version: state.version + 1,
	}));
	previous?.dispose();
}
