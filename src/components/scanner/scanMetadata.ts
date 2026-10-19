export type ScanMetadata = { title: string; subtitle: string; author: string };
/** One book spotted on a shelf photo (spines or covers). */
export type ShelfBook = ScanMetadata & {
	/** Normalised 0..1 box on the shelf photo, when the model reports it. */
	box?: { x: number; y: number; width: number; height: number };
};
export const SCAN_METADATA_URL = "https://boooks-scan.iam-249.workers.dev/scan";
export const SHELF_SCAN_URL = "https://boooks-scan.iam-249.workers.dev/shelf";
export const SHELF_SCAN_PROMPT =
	"This is a photo of a bookshelf. List every book you can read, left to right, " +
	"one entry per physical book. Reply with JSON only: " +
	'{"books":[{"title":"","subtitle":"","author":"","box":{"x":0,"y":0,"width":0,"height":0}}]}. ' +
	"Use empty strings when a field is unreadable; box is normalised 0..1.";
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

/** Parses `{ books: [...] }` (or a bare array); bad entries are skipped. */
export function parseShelfBooks(value: unknown): ShelfBook[] {
	const list = Array.isArray(value)
		? value
		: value && typeof value === "object" && "books" in value
			? (value as { books: unknown }).books
			: null;
	if (!Array.isArray(list)) throw new ScanMetadataError("Invalid AI response");
	const books: ShelfBook[] = [];
	for (const entry of list) {
		try {
			const book: ShelfBook = parseScanMetadata(entry);
			const box = (entry as { box?: unknown }).box;
			if (box && typeof box === "object") {
				const b = box as Record<string, unknown>;
				const n = (key: string) =>
					typeof b[key] === "number" && Number.isFinite(b[key])
						? Math.min(1, Math.max(0, b[key] as number))
						: null;
				const x = n("x");
				const y = n("y");
				const width = n("width");
				const height = n("height");
				if (x !== null && y !== null && width !== null && height !== null)
					book.box = { x, y, width, height };
			}
			if (book.title || book.author) books.push(book);
		} catch {
			// skip malformed entries, keep the rest of the shelf
		}
	}
	return books;
}

function errorMessage(status: number, error?: unknown) {
	if (status === 413) return "Photo is too large to read.";
	if (status === 400) return "The service could not read this photo.";
	if (status >= 500) return "AI is unavailable right now.";
	return typeof error === "string" && error ? error : `HTTP ${status}`;
}

async function encodeScanImage(source: string, signal: AbortSignal) {
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
	return blob;
}

export async function requestScanMetadata(
	source: string,
	signal: AbortSignal,
): Promise<ScanMetadata> {
	const blob = await encodeScanImage(source, signal);
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

/**
 * Ask the AI for every book on a shelf photo. The caller is expected to walk
 * the returned array one book at a time (see BookScanner's shelf queue), so
 * the user never gets a wall of books dumped on them at once.
 */
export async function requestShelfScan(
	source: string,
	signal: AbortSignal,
): Promise<ShelfBook[]> {
	const blob = await encodeScanImage(source, signal);
	const form = new FormData();
	form.append("image", blob, "shelf.jpg");
	form.append("mode", "shelf");
	form.append("prompt", SHELF_SCAN_PROMPT);
	const response = await fetch(SHELF_SCAN_URL, {
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
	return parseShelfBooks(body);
}
