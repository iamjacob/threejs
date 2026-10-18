export type RenderQuality = {
	tier: "low" | "high";
	/** [min, max] device pixel ratio for the main canvas. */
	dpr: [number, number];
	shadows: boolean;
	shadowMapSize: number;
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
	return low
		? { tier: "low", dpr: [1, 1], shadows: true, shadowMapSize: 512 }
		: { tier: "high", dpr: [1, 1.5], shadows: true, shadowMapSize: 1024 };
}

export function currentRenderQuality(): RenderQuality {
	if (typeof navigator === "undefined") return detectRenderQuality({});
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
