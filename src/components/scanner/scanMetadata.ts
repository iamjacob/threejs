export type ScanMetadata = { title: string; subtitle: string; author: string };
export const SCAN_METADATA_URL = "https://boooks-scan.iam-249.workers.dev/scan";
export const SCAN_MAX_EDGE = 1024;
export const SCAN_JPEG_QUALITY = 0.8;
export const SCAN_TIMEOUT_MS = 30000;

/** Error with the HTTP status (0 when the request never got a response). */
export class ScanMetadataError extends Error {
	readonly status: number;
	constructor(message: string, status = 0) {
		super(message);
		this.name = "ScanMetadataError";
		this.status = status;
	}
}

/** Parses `{ title, subtitle, author, _meta? }`; extra keys are ignored. */
export function parseScanMetadata(value: unknown): ScanMetadata {
	if (!value || typeof value !== "object")
		throw new ScanMetadataError("Invalid AI response");
	const result = {} as ScanMetadata;
	for (const key of ["title", "subtitle", "author"] as const) {
		const field = (value as Record<string, unknown>)[key];
		if (field != null && typeof field !== "string")
			throw new ScanMetadataError("Invalid AI response");
		result[key] = (field ?? "").trim().slice(0, 300);
	}
	return result;
}

function errorMessage(status: number, error?: unknown) {
	if (status === 413) return "Photo is too large to read.";
	if (status === 400) return "The service could not read this photo.";
	if (status >= 500) return "AI is unavailable right now.";
	return typeof error === "string" && error ? error : `HTTP ${status}`;
}

export async function requestScanMetadata(
	source: string,
	signal: AbortSignal,
): Promise<ScanMetadata> {
	const image = new Image();
	image.src = source;
	await image.decode();
	signal.throwIfAborted();
	const scale = Math.min(
		1,
		SCAN_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
	);
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
	canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Image processing unavailable");
	context.fillStyle = "#fff";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.drawImage(image, 0, 0, canvas.width, canvas.height);
	const blob = await new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(value) =>
				value ? resolve(value) : reject(new Error("Image encoding failed")),
			"image/jpeg",
			SCAN_JPEG_QUALITY,
		),
	);
	signal.throwIfAborted();
	const form = new FormData();
	form.append("image", blob, "cover.jpg");
	const response = await fetch(SCAN_METADATA_URL, {
		method: "POST",
		credentials: "omit",
		signal,
		headers: { Accept: "application/json" },
		body: form,
	});
	const body: unknown = await response.json().catch(() => null);
	const error =
		body && typeof body === "object" && "error" in body
			? (body as { error: unknown }).error
			: undefined;
	if (!response.ok || error)
		throw new ScanMetadataError(
			errorMessage(response.status, error),
			response.status,
		);
	return parseScanMetadata(body);
}
