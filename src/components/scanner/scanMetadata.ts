export type ScanMetadata = { title: string; subtitle: string; author: string };
export const SCAN_METADATA_URL = "https://ai.boooks.app/v1/scans/metadata";

export function parseScanMetadata(value: unknown): ScanMetadata {
	if (!value || typeof value !== "object" || !("metadata" in value))
		throw new Error("Invalid AI response");
	const metadata = value.metadata;
	if (!metadata || typeof metadata !== "object")
		throw new Error("Invalid AI response");
	const result = {} as ScanMetadata;
	for (const key of ["title", "subtitle", "author"] as const) {
		const field = (metadata as Record<string, unknown>)[key];
		if (field !== null && typeof field !== "string")
			throw new Error("Invalid AI response");
		result[key] = (field ?? "").trim().slice(0, 300);
	}
	return result;
}

export async function requestScanMetadata(
	source: string,
	scanId: string,
	signal: AbortSignal,
): Promise<ScanMetadata> {
	const image = new Image();
	image.src = source;
	await image.decode();
	signal.throwIfAborted();
	const scale = Math.min(
		1,
		768 / Math.max(image.naturalWidth, image.naturalHeight),
	);
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
	canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Image processing unavailable");
	context.fillStyle = "#fff";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.drawImage(image, 0, 0, canvas.width, canvas.height);
	const data = canvas.toDataURL("image/jpeg", 0.72).split(",")[1];
	const response = await fetch(SCAN_METADATA_URL, {
		method: "POST",
		credentials: "omit",
		signal,
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify({
			version: 1,
			scanId,
			image: {
				mimeType: "image/jpeg",
				base64: data,
				width: canvas.width,
				height: canvas.height,
			},
			part: "front",
			fields: ["title", "subtitle", "author"],
		}),
	});
	if (!response.ok) throw new Error("AI service unavailable");
	return parseScanMetadata(await response.json());
}
