/**
 * Beta scanner models. Each one is a "Gutenberg" build; the version tells the
 * story of what it can do.
 */
export const scannerModels = [
	{
		id: "manual",
		name: "Gutenberg 0.1",
		version: "0.1",
		label: "Manual",
		description: "Crop by hand.",
		enrich: false,
	},
	{
		id: "corners",
		name: "Gutenberg 0.2",
		version: "0.2",
		label: "Auto",
		description: "Finds the corners for you.",
		enrich: false,
	},
	{
		id: "enrich",
		name: "Gutenberg 0.3",
		version: "0.3",
		label: "Enrich",
		description: "Auto, plus book details and size.",
		enrich: true,
	},
	{
		id: "ui",
		name: "Gutenberg 0.4",
		version: "0.4",
		label: "UI",
		description: "Enrich, full screen glass and fewer controls.",
		enrich: true,
	},
] as const;

export type ScannerModel = (typeof scannerModels)[number]["id"];

/** Where a model is allowed to look for book details. */
export const scannerDataModes = [
	{
		id: "online",
		label: "Online",
		description: "Look up details on the web.",
	},
	{
		id: "offline",
		label: "Offline",
		description: "No lookups.",
	},
	{
		id: "private",
		label: "Private",
		description: "Local catalog and barcode only.",
	},
] as const;
export type ScannerDataMode = (typeof scannerDataModes)[number]["id"];

const storageKey = "boooks.scanner-model";
const modeKey = "boooks.scanner-data-mode";
const modelIds = scannerModels.map((model) => model.id) as string[];
const modeIds = scannerDataModes.map((mode) => mode.id) as string[];

export function readScannerModel(): ScannerModel {
	try {
		const saved = localStorage.getItem(storageKey);
		return saved && modelIds.includes(saved) ? (saved as ScannerModel) : "ui";
	} catch {
		return "ui";
	}
}

export function saveScannerModel(model: ScannerModel) {
	try {
		localStorage.setItem(storageKey, model);
	} catch {
		// The selector still works when browser storage is unavailable.
	}
}

export function readScannerDataMode(): ScannerDataMode {
	try {
		const saved = localStorage.getItem(modeKey);
		return saved && modeIds.includes(saved)
			? (saved as ScannerDataMode)
			: "online";
	} catch {
		return "online";
	}
}

export function saveScannerDataMode(mode: ScannerDataMode) {
	try {
		localStorage.setItem(modeKey, mode);
	} catch {
		// Keep the choice for this visit.
	}
}

/** Does this model detect corners automatically? */
export function detectsCorners(model: ScannerModel) {
	return model !== "manual";
}

/** Does this model use the 0.4 full-screen glass UI with the simpler controls? */
export function usesGlassUI(model: ScannerModel) {
	return model === "ui";
}

/** Does this model/mode pair look up book details at all? */
export function enriches(model: ScannerModel, mode: ScannerDataMode) {
	return (
		(scannerModels.find((item) => item.id === model)?.enrich ?? false) &&
		mode !== "offline"
	);
}
