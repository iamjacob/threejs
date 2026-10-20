export type ScanMetadata = {
	title: string;
	subtitle: string;
	author: string;
	/**
	 * The next three arrive only when the reader reports them (it does when it
	 * follows SCAN_METADATA_PROMPT). Absent means "the reader did not say".
	 */
	isBook?: boolean;
	/** 0..1: how sure the reader is of the title it returned. */
	confidence?: number;
	/** Why it is not sure, or why this is not a book cover. */
	reason?: string;
};
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
/**
 * Sent with every cover read. A reader that follows it answers with whether
 * the photo is a book cover and how sure it is, and never guesses a title.
 * (The reader currently ignores it; the checks below work either way.)
 */
export const SCAN_METADATA_PROMPT =
	"Look at this photo. Decide whether it shows the FRONT COVER of a book. " +
	"Reply with JSON only, no other text: " +
	'{"is_book":true or false,' +
	'"confidence":a number from 0 to 1 for how sure you are of the title you read,' +
	'"title":"","subtitle":"","author":"",' +
	'"reason":"one short sentence when is_book is false or confidence is below 0.6, else empty"}. ' +
	"Use empty strings, never the word null, for anything you cannot read. " +
	"Never guess a title you cannot read.";
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

/**
 * What a model writes when it could not read a field ("null", "unknown",
 * "no title"…). Never a real title, subtitle or author.
 */
const PLACEHOLDER =
	/^(null|undefined|nil|n\/a|na|none|unknown|untitled|no title|not visible|not readable|unreadable|illegible|[-?._\s]*)$/i;

/** Is this text a real title, safe to search for and to save a book under? */
export function isUsableTitle(text: string) {
	const clean = text.trim();
	return (
		clean.length >= 2 && /[\p{L}\p{N}]/u.test(clean) && !PLACEHOLDER.test(clean)
	);
}

/** Models answer 0.85, "0.85" or 85 (percent); anything else is "not said". */
function parseConfidence(value: unknown): number | undefined {
	const number = typeof value === "string" ? Number.parseFloat(value) : value;
	if (typeof number !== "number" || !Number.isFinite(number) || number < 0)
		return undefined;
	if (number <= 1) return number;
	return number <= 100 ? number / 100 : undefined;
}

/** Parses `{ title, subtitle, author, is_book?, confidence?, reason?, _meta? }`; extra keys are ignored. */
export function parseScanMetadata(value: unknown): ScanMetadata {
	if (!value || typeof value !== "object")
		throw new ScanMetadataError("Invalid AI response");
	const raw = value as Record<string, unknown>;
	const result = {} as ScanMetadata;
	for (const key of ["title", "subtitle", "author"] as const) {
		const field = raw[key];
		if (field != null && typeof field !== "string")
			throw new ScanMetadataError("Invalid AI response");
		const text = (field ?? "").trim().slice(0, 300);
		// A field the model could not read comes back empty, never "null".
		result[key] = PLACEHOLDER.test(text) ? "" : text;
	}
	// Optional self-assessment: only present when the reader gave one.
	const isBook = raw.is_book ?? raw.isBook;
	if (typeof isBook === "boolean") result.isBook = isBook;
	const confidence = parseConfidence(raw.confidence);
	if (confidence !== undefined) result.confidence = confidence;
	if (typeof raw.reason === "string") {
		const reason = raw.reason.trim().slice(0, 160);
		if (reason && !PLACEHOLDER.test(reason)) result.reason = reason;
	}
	return result;
}

/** Below this the reader's title is treated as "not read"; below CONFIDENT it is flagged. */
export const CONFIDENCE_MIN = 0.4;
export const CONFIDENCE_OK = 0.65;

/**
 * Does this look like words on a cover, and not gibberish or a paragraph?
 * Heuristic guard for readers that give no confidence of their own.
 */
export function isPlausibleTitle(text: string) {
	const clean = text.trim();
	if (!isUsableTitle(clean) || clean.length > 150) return false;
	const solid = clean.replace(/\s/g, "");
	const wordy = solid.replace(/[^\p{L}\p{N}]/gu, "");
	return wordy.length / solid.length >= 0.6 && !/(.)\1{5,}/u.test(clean);
}

/**
 * Is this tiny grayscale sample (0..255) essentially featureless? A blank page,
 * a lens cap or a wall has almost no edges, however it is lit; any cover with
 * art or print has plenty. `gray` is row-major, width × height.
 */
export function isFlatImage(
	gray: ArrayLike<number>,
	width: number,
	height: number,
) {
	let sum = 0;
	let count = 0;
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const here = gray[y * width + x];
			if (x + 1 < width) {
				sum += Math.abs(here - gray[y * width + x + 1]);
				count++;
			}
			if (y + 1 < height) {
				sum += Math.abs(here - gray[(y + 1) * width + x]);
				count++;
			}
		}
	return count === 0 || sum / count < 1.2;
}

/** Samples a photo at 48×64 and tests it with isFlatImage. False if it cannot tell. */
export async function sampleIsFlat(source: string): Promise<boolean> {
	try {
		const image = new Image();
		image.src = source;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = 48;
		canvas.height = 64;
		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) return false;
		context.drawImage(image, 0, 0, 48, 64);
		const { data } = context.getImageData(0, 0, 48, 64);
		const gray = new Uint8Array(48 * 64);
		for (let i = 0; i < gray.length; i++)
			gray[i] =
				data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
		return isFlatImage(gray, 48, 64);
	} catch {
		return false;
	}
}

/** What the cover reader found, as far as the user needs to know. */
export type CoverVerdict =
	| { kind: "ok" }
	/** A title was read, but it may be wrong: show it, flagged. */
	| { kind: "check"; message: string; title: string }
	/** Nothing usable was read: do not prefill; ask for a title. */
	| { kind: "empty"; message: string }
	/** The photo is not a book cover: suggest retaking it. */
	| { kind: "not-book"; message: string };

/**
 * One decision from every signal: the reader's own is_book / confidence when
 * it gives them, plus local checks (a blank photo, a title that looks like
 * gibberish). `flat` is the result of sampleIsFlat for the photo.
 */
export function judgeCover(meta: ScanMetadata, flat = false): CoverVerdict {
	if (meta.isBook === false)
		return {
			kind: "not-book",
			message: meta.reason || "This doesn’t look like a book cover.",
		};
	if (!isUsableTitle(meta.title))
		return flat
			? {
					kind: "not-book",
					message: "This photo looks blank. Is the cover in the frame?",
				}
			: { kind: "empty", message: "No title found on this cover." };
	if (meta.confidence !== undefined && meta.confidence < CONFIDENCE_MIN)
		return {
			kind: "empty",
			message: meta.reason || "Couldn’t read the title clearly.",
		};
	if (
		(meta.confidence !== undefined && meta.confidence < CONFIDENCE_OK) ||
		!isPlausibleTitle(meta.title)
	)
		return {
			kind: "check",
			message: meta.reason || "Not sure about this title. Please check it.",
			title: meta.title,
		};
	return { kind: "ok" };
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
	if (status === 404) return "This reader isn’t available right now.";
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
	form.append("prompt", SCAN_METADATA_PROMPT);
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
