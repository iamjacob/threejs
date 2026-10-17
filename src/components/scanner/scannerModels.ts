export const scannerModels = [
	{
		id: "manual",
		name: "Scanner 1",
		label: "Manual crop",
		description: "Place the four crop corners yourself.",
	},
	{
		id: "corners",
		name: "Scanner 2",
		label: "Auto corners",
		description: "Detect the corners, then fine-tune your crop.",
	},
] as const;

export type ScannerModel = (typeof scannerModels)[number]["id"];
const storageKey = "boooks.scanner-model";

export function readScannerModel(): ScannerModel {
	try {
		return localStorage.getItem(storageKey) === "corners"
			? "corners"
			: "manual";
	} catch {
		return "manual";
	}
}

export function saveScannerModel(model: ScannerModel) {
	try {
		localStorage.setItem(storageKey, model);
	} catch {
		// The selector still works when browser storage is unavailable.
	}
}
