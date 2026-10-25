import {
	isUsableTitle,
	requestScanMetadata,
} from "../components/scanner/scanMetadata";

export type CoverRead = { title: string; author: string };

/**
 * The flight does not mount BookScanner (that UI is a full-screen crop and
 * review flow). This is the seam: a captured frame goes to the same reader
 * the scanner uses. Tests and a future on-device model replace it with
 * `setOnboardingCoverReader`.
 */
export type CoverReader = (
	imageDataUrl: string,
	signal: AbortSignal,
) => Promise<CoverRead>;

let installed: CoverReader | null = null;

export function setOnboardingCoverReader(reader: CoverReader | null) {
	installed = reader;
}

export async function readOnboardingCover(
	imageDataUrl: string,
	signal: AbortSignal,
): Promise<CoverRead> {
	if (installed) return installed(imageDataUrl, signal);
	const meta = await requestScanMetadata(imageDataUrl, signal);
	return {
		title: isUsableTitle(meta.title) ? meta.title.trim() : "",
		author: meta.author.trim(),
	};
}
