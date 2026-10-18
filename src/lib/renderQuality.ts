export type RenderQuality = {
	tier: "low" | "high";
	/** [min, max] device pixel ratio for the main canvas. */
	dpr: [number, number];
	shadows: boolean;
	shadowMapSize: number;
	/** Flickering fire/row point lights; off on low-end to cut per-pixel lighting cost. */
	pointLights: boolean;
};

type DeviceHints = {
	hardwareConcurrency?: number;
	deviceMemory?: number;
	userAgent?: string;
	saveData?: boolean;
};

/**
 * Low-end phones have few cores or little memory; they get a 1× canvas and a
 * smaller shadow map. Everything else renders at up to 1.5× with full shadows —
 * 2× and above is invisible on a 3D shelf but doubles fragment work.
 */
export function detectRenderQuality(hints: DeviceHints): RenderQuality {
	const cores = hints.hardwareConcurrency ?? 8;
	const memory = hints.deviceMemory ?? 8;
	const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(hints.userAgent ?? "");
	const low =
		hints.saveData === true ||
		cores <= 4 ||
		memory <= 2 ||
		(mobile && cores <= 6);
	// Mobile GPUs are fill-rate bound: the shadow pass is a second full draw of
	// every caster, and each point light adds a per-pixel cost to everything lit.
	return low
		? {
				tier: "low",
				dpr: [1, 1],
				shadows: false,
				shadowMapSize: 512,
				pointLights: false,
			}
		: {
				tier: "high",
				dpr: [1, 1.5],
				shadows: true,
				shadowMapSize: 1024,
				pointLights: true,
			};
}

/**
 * Shelf covers never need the multi-thousand-pixel originals (up to ~3800px,
 * ~860 MB RGBA across the library); those are for the reader. Close-up levels
 * like level 4 otherwise decode and upload them on the main thread.
 */
export const MAX_SHELF_IMAGE_LEVEL = "detail" as const;

/** Anisotropic sampling multiplies texture fetches; low-tier GPUs get half. */
export function shelfAnisotropy(quality: RenderQuality) {
	return quality.tier === "low" ? 2 : 4;
}

export const PERFORMANCE_MODE_KEY = "boooks-performance-mode";

/** Manual override from the menu; a page reload applies it. */
export function performanceModeEnabled() {
	try {
		return localStorage.getItem(PERFORMANCE_MODE_KEY) === "true";
	} catch {
		return false;
	}
}

export function currentRenderQuality(): RenderQuality {
	if (typeof navigator === "undefined") return detectRenderQuality({});
	if (performanceModeEnabled()) return detectRenderQuality({ saveData: true });
	const nav = navigator as Navigator & {
		deviceMemory?: number;
		connection?: { saveData?: boolean };
	};
	return detectRenderQuality({
		hardwareConcurrency: nav.hardwareConcurrency,
		deviceMemory: nav.deviceMemory,
		userAgent: nav.userAgent,
		saveData: nav.connection?.saveData,
	});
}
