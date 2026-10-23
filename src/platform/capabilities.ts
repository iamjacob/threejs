import { Capacitor } from "@capacitor/core";

/**
 * Small capability adapters used by this foundation. They return plain results and explicit
 * "unavailable"/"denied" states instead of throwing, so use cases can stay platform-agnostic.
 * The old scanner keeps its own getUserMedia pipeline; this does not replace it.
 */
export const platform = {
	name: Capacitor.getPlatform() as "web" | "ios" | "android",
	isNative: Capacitor.isNativePlatform(),
};

export type PickedImage = {
	bytes: Uint8Array;
	mimeType: string;
};

export type CapabilityResult<T> =
	| { status: "ok"; value: T }
	| { status: "cancelled" }
	| { status: "denied" }
	| { status: "unavailable"; reason: string };

/** Camera/gallery image for attachments. Native: @capacitor/camera. Web: a file input. */
export async function pickImage(): Promise<CapabilityResult<PickedImage>> {
	if (!platform.isNative) return pickImageWeb();
	try {
		const { Camera, MediaTypeSelection } = await import("@capacitor/camera");
		const { results } = await Camera.chooseFromGallery({
			mediaType: MediaTypeSelection.Photo,
			allowMultipleSelection: false,
			quality: 85,
			targetWidth: 2048,
			targetHeight: 2048,
		});
		const first = results[0];
		if (!first?.webPath) return { status: "cancelled" };
		const blob = await (await fetch(first.webPath)).blob();
		return {
			status: "ok",
			value: {
				bytes: new Uint8Array(await blob.arrayBuffer()),
				mimeType: blob.type || "image/jpeg",
			},
		};
	} catch (error) {
		const message = String((error as Error)?.message ?? error);
		if (/cancel/i.test(message)) return { status: "cancelled" };
		if (/denied|permission/i.test(message)) return { status: "denied" };
		return { status: "unavailable", reason: message };
	}
}

function pickImageWeb(): Promise<CapabilityResult<PickedImage>> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/png,image/jpeg,image/webp,image/gif";
		input.addEventListener("change", async () => {
			const file = input.files?.[0];
			if (!file) return resolve({ status: "cancelled" });
			resolve({
				status: "ok",
				value: {
					bytes: new Uint8Array(await file.arrayBuffer()),
					mimeType: file.type,
				},
			});
		});
		input.addEventListener("cancel", () => resolve({ status: "cancelled" }));
		input.click();
	});
}

export type PickedDocument = {
	bytes: Uint8Array;
	/** As reported by the OS/browser; often empty or generic for EPUB. Only a hint. */
	mimeType: string;
	name: string;
};

/**
 * One document from the device (EPUB/PDF). Uses <input type=file> on web AND native: Capacitor's
 * Android WebView answers it with the system document picker (BridgeWebChromeClient
 * onShowFileChooser), and iOS WKWebView shows the Files picker. No extra plugin. `maxBytes` is
 * checked before reading, so an oversized file is never loaded into memory.
 */
export function pickDocument(
	accept: string,
	maxBytes: number,
): Promise<
	| CapabilityResult<PickedDocument>
	| { status: "too_large"; size: number; name: string }
> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = accept;
		input.addEventListener("change", async () => {
			const file = input.files?.[0];
			if (!file) return resolve({ status: "cancelled" });
			if (file.size > maxBytes)
				return resolve({
					status: "too_large",
					size: file.size,
					name: file.name,
				});
			try {
				resolve({
					status: "ok",
					value: {
						bytes: new Uint8Array(await file.arrayBuffer()),
						mimeType: file.type,
						name: file.name,
					},
				});
			} catch (error) {
				resolve({
					status: "unavailable",
					reason: String((error as Error)?.message ?? error),
				});
			}
		});
		input.addEventListener("cancel", () => resolve({ status: "cancelled" }));
		input.click();
	});
}

export type GeoFix = {
	latitude: number;
	longitude: number;
	accuracy: number;
	timestamp: number;
};

/** One-shot position. Works offline from GPS on native; web depends on the browser. */
export async function getPosition(): Promise<CapabilityResult<GeoFix>> {
	try {
		const { Geolocation } = await import("@capacitor/geolocation");
		const { coords, timestamp } = await Geolocation.getCurrentPosition({
			enableHighAccuracy: false,
			timeout: 15_000,
			maximumAge: 60_000,
		});
		return {
			status: "ok",
			value: {
				latitude: coords.latitude,
				longitude: coords.longitude,
				accuracy: coords.accuracy,
				timestamp,
			},
		};
	} catch (error) {
		const message = String((error as Error)?.message ?? error);
		if (/denied|permission/i.test(message)) return { status: "denied" };
		return { status: "unavailable", reason: message };
	}
}
