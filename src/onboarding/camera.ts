/**
 * Live preview for the onboarding card.
 *
 * Permission is requested only when `openOnboardingCamera()` runs. The card
 * calls that from the "Open camera" tap. Importing this module never opens
 * a camera.
 *
 * Web uses getUserMedia so the feed can sit inside the card. Capacitor's
 * `Camera.getPhoto` is a system sheet, not an in-scene preview, so it is not
 * this path. A native build plugs in by calling `setOnboardingCameraSource`
 * with an adapter whose `open()` resolves a MediaStream (or any stream the
 * card can assign to a video element) from the same tap.
 */

export type CameraBlock = "denied" | "unavailable";

export type OnboardingCameraSource = {
	open: () => Promise<MediaStream>;
};

let installed: OnboardingCameraSource | null = null;

export function setOnboardingCameraSource(
	source: OnboardingCameraSource | null,
) {
	installed = source;
}

export function cameraBlock(error: unknown): CameraBlock {
	const name =
		error && typeof error === "object" && "name" in error
			? String((error as { name: unknown }).name)
			: "";
	if (
		name === "NotAllowedError" ||
		name === "SecurityError" ||
		name === "PermissionDeniedError" ||
		name === "denied"
	) {
		return "denied";
	}
	return "unavailable";
}

async function openWebCamera() {
	const media = navigator.mediaDevices;
	if (!media?.getUserMedia) {
		const missing = new Error("No camera is available.");
		missing.name = "NotFoundError";
		throw missing;
	}
	return media.getUserMedia({
		video: { facingMode: { ideal: "environment" } },
		audio: false,
	});
}

export async function openOnboardingCamera(): Promise<MediaStream> {
	try {
		return await (installed?.open ?? openWebCamera)();
	} catch (error) {
		const block = cameraBlock(error);
		const wrapped = new Error(
			block === "denied"
				? "Camera permission was denied."
				: "No camera is available.",
		);
		wrapped.name = block;
		throw wrapped;
	}
}

export function stopCamera(stream: MediaStream | null) {
	if (!stream) return;
	for (const track of stream.getTracks()) track.stop();
}
