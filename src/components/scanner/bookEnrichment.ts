export type EnrichmentValues = {
	title?: string;
	author?: string;
	subtitle?: string;
	isbn?: string;
	dimensions?: string;
	physicalSize?: {
		widthCm: number;
		heightCm: number;
		thicknessCm?: number;
		weightGrams?: number;
		source: string;
		estimated?: boolean;
	};
	/** True when this draft's size has been changed in the shared configurator. */
	dimensionsOverridden?: boolean;
	/** Number of pages in the edition, when a source lists it. */
	pageCount?: number;
	year?: string;
	language?: string;
	publication?: string;
	format?: string;
	genre?: string;
	subcategory?: string;
	tags?: string;
	rating?: string;
	quotes?: string;
	notes?: string;
	sources?: string[];
	status?: "idle" | "searching" | "complete" | "partial";
	activeStep?: string | null;
};

export function physicalSizeToWorldDimensions(
	size: NonNullable<EnrichmentValues["physicalSize"]>,
): [number, number, number] {
	return [
		size.widthCm / 30,
		size.heightCm / 30,
		(size.thicknessCm ?? 1.65) / 30,
	];
}

export function physicalSizeToBookSize(
	size: NonNullable<EnrichmentValues["physicalSize"]>,
) {
	return {
		height: size.heightCm,
		width: size.widthCm,
		thickness: size.thicknessCm ?? 1.65,
	};
}

export function formatPhysicalSize(
	size: NonNullable<EnrichmentValues["physicalSize"]>,
) {
	const dimensions = [size.heightCm, size.widthCm, size.thicknessCm]
		.filter((value): value is number => typeof value === "number")
		.join(" × ");
	const weight = size.weightGrams ? ` · ${size.weightGrams} g` : "";
	const thicknessNote =
		size.thicknessCm === undefined ? " · thickness not listed" : "";
	const estimateNote = size.estimated ? " · estimated" : "";
	return `${dimensions} cm${thicknessNote}${estimateNote}${weight}`;
}

type JsonRecord = Record<string, unknown>;
type EnrichmentOptions = {
	signal: AbortSignal;
	onUpdate?: (update: Partial<EnrichmentValues>) => void;
	fetcher?: typeof fetch;
	coverImage?: string;
	catalog?: unknown[];
	isbn?: string;
};

type CatalogBook = {
	title?: string;
	subtitle?: string;
	author?: string;
	isbn?: string;
	language?: string;
	publisher?: string;
	format?: string;
	pages?: number;
	size?: { width?: number; height?: number; thickness?: number };
	weight?: number;
};

const text = (value: unknown): string => {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	if (value && typeof value === "object" && "value" in value)
		return text((value as { value: unknown }).value);
	return "";
};

const list = (value: unknown): string[] =>
	Array.isArray(value)
		? value.map(text).filter(Boolean)
		: value == null
			? []
			: [text(value)].filter(Boolean);

const cleanHtml = (value: string) =>
	value
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();

function languageName(code: string) {
	try {
		return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
	} catch {
		return code;
	}
}

function firstRecord(value: unknown): JsonRecord | undefined {
	return Array.isArray(value) && value[0] && typeof value[0] === "object"
		? (value[0] as JsonRecord)
		: undefined;
}

export function normalizeIsbn(value: string) {
	return value.replace(/[^\dXx]/g, "").toUpperCase();
}

function normalizeBookText(value: string) {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Exact ISBN first; title and author must both agree for a title-based match. */
export function findCatalogMatch(
	entries: unknown[],
	title: string,
	author: string,
	isbn = "",
): CatalogBook | undefined {
	const books = entries.filter((entry): entry is CatalogBook =>
		Boolean(entry && typeof entry === "object" && "title" in entry),
	);
	const normalizedIsbn = normalizeIsbn(isbn);
	if (normalizedIsbn) {
		const byIsbn = books.find(
			(book) => book.isbn && normalizeIsbn(book.isbn) === normalizedIsbn,
		);
		if (byIsbn) return byIsbn;
	}
	const wantedTitle = normalizeBookText(title);
	const wantedAuthor = normalizeBookText(author);
	if (!wantedTitle || !wantedAuthor) return undefined;
	return books.find(
		(book) =>
			normalizeBookText(book.title ?? "") === wantedTitle &&
			normalizeBookText(book.author ?? "") === wantedAuthor,
	);
}

function parseMeasure(value: unknown): number | undefined {
	const raw = text(value).toLowerCase();
	const match = raw.match(/([\d.]+)\s*(mm|cm|in(?:ches)?|")?/);
	if (!match) return undefined;
	const number = Number(match[1]);
	if (!Number.isFinite(number) || number <= 0) return undefined;
	const unit = match[2] ?? "cm";
	return unit === "mm"
		? number / 10
		: unit.startsWith("in") || unit === '"'
			? number * 2.54
			: number;
}

/** Parses conventional height × width × thickness measurements into model order. */
export function parsePhysicalDimensions(value: string, source: string) {
	const parts = value.split(/[×x]/i).map((part) => part.trim());
	if (parts.length < 2) return undefined;
	const sharedUnit = value
		.toLowerCase()
		.match(/(?:^|\s)(mm|cm|in(?:ches)?|")\s*$/)?.[1];
	const withUnit = (part: string) =>
		/[a-z"]\s*$/i.test(part) ? part : `${part} ${sharedUnit ?? "cm"}`;
	const heightCm = parseMeasure(withUnit(parts[0]));
	const widthCm = parseMeasure(withUnit(parts[1]));
	const thicknessCm = parts[2] ? parseMeasure(withUnit(parts[2])) : undefined;
	if (!heightCm || !widthCm) return undefined;
	if (
		heightCm < 8 ||
		heightCm > 40 ||
		widthCm < 5 ||
		widthCm > 30 ||
		(thicknessCm !== undefined && (thicknessCm < 0.2 || thicknessCm > 10))
	)
		return undefined;
	return { widthCm, heightCm, ...(thicknessCm ? { thicknessCm } : {}), source };
}

function catalogMeasurements(book: CatalogBook, matchedByIsbn: boolean) {
	const { width, height, thickness } = book.size ?? {};
	if (
		![width, height, thickness].every(
			(value) =>
				typeof value === "number" && Number.isFinite(value) && value > 0,
		)
	)
		return undefined;
	return {
		widthCm: width as number,
		heightCm: height as number,
		thicknessCm: thickness as number,
		...(typeof book.weight === "number" && book.weight > 0
			? { weightGrams: book.weight }
			: {}),
		source: matchedByIsbn
			? "Local catalog · ISBN edition"
			: "Local catalog · title and author match",
	};
}

function catalogSizeEstimate(book: CatalogBook) {
	const { width, height } = book.size ?? {};
	if (
		typeof width !== "number" ||
		!Number.isFinite(width) ||
		width <= 0 ||
		typeof height !== "number" ||
		!Number.isFinite(height) ||
		height <= 0
	)
		return undefined;
	return {
		widthCm: width,
		heightCm: height,
		source: "Local catalog · estimated thickness",
		estimated: true,
	};
}

function mergeUpdate(
	current: EnrichmentValues,
	update: Partial<EnrichmentValues>,
): EnrichmentValues {
	const merged: EnrichmentValues = { ...current };
	for (const [key, value] of Object.entries(update)) {
		if (key === "sources") {
			merged.sources = [
				...new Set([...(merged.sources ?? []), ...(value as string[])]),
			];
		} else if (value && key !== "activeStep" && key !== "status") {
			(merged as JsonRecord)[key] = value;
		}
	}
	if (update.activeStep !== undefined) merged.activeStep = update.activeStep;
	if (update.status) merged.status = update.status;
	return merged;
}

async function getJson(
	fetcher: typeof fetch,
	url: string,
	signal: AbortSignal,
) {
	const response = await fetcher(url, {
		signal,
		headers: { Accept: "application/json" },
	});
	if (!response.ok)
		throw new Error(`Metadata request failed (${response.status})`);
	return (await response.json()) as JsonRecord;
}

/**
 * Looks up a title against Open Library and Google Books, then uses Wikipedia's
 * public summary API as a description fallback. Each source is optional; network
 * or CORS failures never prevent scanning or saving a book.
 */
export async function enrichBookMetadata(
	title: string,
	author: string,
	{
		signal,
		onUpdate,
		fetcher = fetch,
		coverImage,
		catalog = [],
		isbn = "",
	}: EnrichmentOptions,
): Promise<EnrichmentValues> {
	const cleanTitle = title.trim();
	if (!cleanTitle) return { status: "partial", activeStep: null };
	let result: EnrichmentValues = { status: "searching", activeStep: "Year" };
	const publish = (update: Partial<EnrichmentValues>) => {
		result = mergeUpdate(result, update);
		onUpdate?.(update);
	};
	const query = [cleanTitle, author.trim()].filter(Boolean).join(" ");
	const sources: string[] = [];
	if (coverImage) {
		publish({ activeStep: "Barcode/ISBN" });
		try {
			const BarcodeDetectorConstructor = (
				globalThis as typeof globalThis & {
					BarcodeDetector?: new (options?: {
						formats: string[];
					}) => {
						detect: (image: ImageBitmap) => Promise<{ rawValue: string }[]>;
					};
				}
			).BarcodeDetector;
			if (
				BarcodeDetectorConstructor &&
				typeof createImageBitmap === "function"
			) {
				const detector = new BarcodeDetectorConstructor({
					formats: ["ean_13", "ean_8", "upc_a"],
				});
				const imageResponse = await fetcher(coverImage, { signal });
				const bitmap = await createImageBitmap(await imageResponse.blob());
				try {
					const codes = await detector.detect(bitmap);
					const isbn = codes
						.map((code) => code.rawValue.replace(/\D/g, ""))
						.find((code) => /^(978|979)\d{10}$/.test(code));
					if (isbn) publish({ isbn });
				} finally {
					bitmap.close();
				}
			}
		} catch (error) {
			if (signal.aborted) throw error;
		}
	}
	const matchedIsbn = isbn || result.isbn || "";
	const catalogMatch = findCatalogMatch(
		catalog,
		cleanTitle,
		author,
		matchedIsbn,
	);
	if (catalogMatch) {
		const isIsbnMatch = Boolean(
			matchedIsbn &&
				catalogMatch.isbn &&
				normalizeIsbn(catalogMatch.isbn) === normalizeIsbn(matchedIsbn),
		);
		const physicalSize = catalogMeasurements(catalogMatch, isIsbnMatch);
		const catalogSize = physicalSize ?? catalogSizeEstimate(catalogMatch);
		if (physicalSize) sources.push("Local catalog");
		publish({
			subtitle: catalogMatch.subtitle || undefined,
			isbn: result.isbn ?? catalogMatch.isbn ?? undefined,
			language:
				result.language ??
				(catalogMatch.language
					? languageName(catalogMatch.language)
					: undefined),
			publication: result.publication ?? (catalogMatch.publisher || undefined),
			format:
				result.format ??
				([
					catalogMatch.format,
					catalogMatch.pages ? `${catalogMatch.pages} pages` : "",
				]
					.filter(Boolean)
					.join(" · ") ||
					undefined),
			dimensions:
				result.dimensions ??
				(catalogSize ? formatPhysicalSize(catalogSize) : undefined),
			physicalSize: catalogSize ?? result.physicalSize,
			pageCount: catalogMatch.pages || undefined,
		});
	}

	try {
		const url = new URL("https://openlibrary.org/search.json");
		if (result.isbn) url.searchParams.set("isbn", result.isbn);
		else {
			url.searchParams.set("title", cleanTitle);
			if (author.trim()) url.searchParams.set("author", author.trim());
		}
		url.searchParams.set("limit", "5");
		url.searchParams.set(
			"fields",
			"key,title,author_name,first_publish_year,isbn,language,publisher,publish_place,number_of_pages_median,subject,ratings_average,ratings_count,first_sentence,edition_key",
		);
		const response = await getJson(fetcher, url.toString(), signal);
		const docs = Array.isArray(response.docs)
			? (response.docs as JsonRecord[])
			: [];
		const doc = docs[0];
		if (doc) {
			sources.push("Open Library");
			const subjects = list(doc.subject);
			const languages = list(doc.language);
			const publishers = list(doc.publisher);
			const places = list(doc.publish_place);
			const isbns = list(doc.isbn);
			const firstSentence =
				text(firstRecord(doc.first_sentence)?.value) ||
				list(doc.first_sentence)[0];
			publish({
				title: text(doc.title) || undefined,
				author: list(doc.author_name).join(", ") || undefined,
				year: text(doc.first_publish_year),
				language: languages[0] ? languageName(languages[0]) : undefined,
				publication:
					[publishers[0], places[0]].filter(Boolean).join(" · ") || undefined,
				format: text(doc.number_of_pages_median)
					? `About ${text(doc.number_of_pages_median)} pages`
					: undefined,
				pageCount: Number(doc.number_of_pages_median) || undefined,
				isbn:
					result.isbn ??
					isbns.find((value) => value.replace(/\D/g, "").length === 13) ??
					isbns[0],
				genre: subjects[0],
				subcategory: subjects[1],
				tags: subjects.slice(0, 8).join(", ") || undefined,
				rating:
					typeof doc.ratings_average === "number"
						? `${doc.ratings_average.toFixed(1)} / 5${typeof doc.ratings_count === "number" ? ` (${doc.ratings_count.toLocaleString()} ratings)` : ""}`
						: undefined,
				quotes: firstSentence
					? cleanHtml(firstSentence).slice(0, 240)
					: undefined,
			});
			const work = text(doc.key);
			if (work.startsWith("/works/")) {
				publish({ activeStep: "Notes" });
				const editions = list(doc.edition_key).slice(0, 1);
				const detailRequests = [
					getJson(fetcher, `https://openlibrary.org${work}.json`, signal).then(
						(data) => ({ kind: "work", data }),
					),
					...(editions[0]
						? [
								getJson(
									fetcher,
									`https://openlibrary.org/books/${encodeURIComponent(editions[0])}.json`,
									signal,
								).then((data) => ({ kind: "edition", data })),
							]
						: []),
					...(typeof doc.ratings_average !== "number"
						? [
								getJson(
									fetcher,
									`https://openlibrary.org${work}/ratings.json`,
									signal,
								).then((data) => ({ kind: "ratings", data })),
							]
						: []),
				];
				const details = await Promise.allSettled(detailRequests);
				for (const detail of details) {
					if (detail.status === "rejected") {
						if (signal.aborted) throw detail.reason;
						continue;
					}
					const { kind, data } = detail.value;
					if (kind === "work") {
						const description = text(data.description);
						const workSubjects = list(data.subjects);
						const excerpts = list(data.excerpts).map((item) => cleanHtml(item));
						publish({
							notes: description
								? cleanHtml(description).slice(0, 700)
								: undefined,
							genre: result.genre ?? workSubjects[0],
							subcategory: result.subcategory ?? workSubjects[1],
							tags:
								result.tags ??
								(workSubjects.slice(0, 8).join(", ") || undefined),
							quotes: result.quotes ?? excerpts[0]?.slice(0, 240),
						});
					} else if (kind === "edition") {
						const dimensions = text(data.physical_dimensions);
						const publishers = list(data.publishers);
						const places = list(data.publish_places);
						const pages = text(data.number_of_pages);
						const physicalSize = dimensions
							? parsePhysicalDimensions(dimensions, "Open Library edition")
							: undefined;
						publish({
							dimensions: physicalSize
								? formatPhysicalSize(physicalSize)
								: dimensions
									? `${dimensions} (listed edition)`
									: undefined,
							physicalSize: physicalSize ?? result.physicalSize,
							publication:
								result.publication ??
								([publishers[0], places[0]].filter(Boolean).join(" · ") ||
									undefined),
							format:
								result.format ??
								([text(data.physical_format), pages ? `${pages} pages` : ""]
									.filter(Boolean)
									.join(" · ") ||
									undefined),
							pageCount: Number(pages) || result.pageCount,
							isbn:
								result.isbn ?? list(data.isbn_13)[0] ?? list(data.isbn_10)[0],
						});
					} else {
						const summary = data.summary as JsonRecord | undefined;
						const average = text(summary?.average);
						const count = text(summary?.count);
						if (average)
							publish({
								rating:
									result.rating ??
									`${Number(average).toFixed(1)} / 5${count ? ` (${Number(count).toLocaleString()} ratings)` : ""}`,
							});
					}
				}
			}
		}
	} catch (error) {
		if (signal.aborted) throw error;
	}

	if (!signal.aborted) {
		publish({ activeStep: "Publication" });
		try {
			const url = new URL("https://www.googleapis.com/books/v1/volumes");
			url.searchParams.set(
				"q",
				result.isbn
					? `isbn:${result.isbn}`
					: `intitle:${cleanTitle}${author.trim() ? ` inauthor:${author.trim()}` : ""}`,
			);
			url.searchParams.set("maxResults", "5");
			const response = await getJson(fetcher, url.toString(), signal);
			const items = Array.isArray(response.items)
				? (response.items as JsonRecord[])
				: [];
			const volume = items[0]?.volumeInfo as JsonRecord | undefined;
			if (volume) {
				sources.push("Google Books");
				const identifiers = Array.isArray(volume.industryIdentifiers)
					? (volume.industryIdentifiers as JsonRecord[])
					: [];
				const categories = list(volume.categories).flatMap((item) =>
					item.split(" / "),
				);
				const dimensions = volume.dimensions as JsonRecord | undefined;
				const size = dimensions
					? [dimensions.height, dimensions.width, dimensions.thickness]
							.map(text)
							.filter(Boolean)
							.join(" × ")
					: "";
				const physicalSize = dimensions
					? parsePhysicalDimensions(
							[dimensions.height, dimensions.width, dimensions.thickness]
								.map(text)
								.filter(Boolean)
								.join(" × "),
							"Google Books edition",
						)
					: undefined;
				const description = cleanHtml(text(volume.description));
				publish({
					year:
						result.year ??
						(text(volume.publishedDate).slice(0, 4) || undefined),
					language:
						result.language ??
						(text(volume.language)
							? languageName(text(volume.language))
							: undefined),
					publication:
						result.publication ?? (text(volume.publisher) || undefined),
					format:
						result.format ??
						([
							text(volume.printType),
							volume.pageCount ? `${text(volume.pageCount)} pages` : "",
						]
							.filter(Boolean)
							.join(" · ") ||
							undefined),
					pageCount:
						result.pageCount ?? (Number(volume.pageCount) || undefined),
					isbn:
						result.isbn ??
						(text(
							identifiers.find((item) => item.type === "ISBN_13")?.identifier,
						) ||
							text(identifiers[0]?.identifier) ||
							undefined),
					dimensions:
						result.dimensions ??
						(physicalSize
							? formatPhysicalSize(physicalSize)
							: size
								? `${size} (listed edition)`
								: undefined),
					physicalSize: result.physicalSize ?? physicalSize,
					genre: result.genre ?? categories[0],
					subcategory: result.subcategory ?? categories[1],
					tags: result.tags ?? (categories.slice(0, 8).join(", ") || undefined),
					rating:
						result.rating ??
						(typeof volume.averageRating === "number"
							? `${volume.averageRating.toFixed(1)} / 5${volume.ratingsCount ? ` (${Number(volume.ratingsCount).toLocaleString()} ratings)` : ""}`
							: undefined),
					quotes:
						result.quotes ??
						(cleanHtml(
							text(
								(items[0]?.searchInfo as JsonRecord | undefined)?.textSnippet,
							),
						).slice(0, 240) ||
							undefined),
					notes:
						result.notes ??
						(description ? description.slice(0, 700) : undefined),
				});
			}
		} catch (error) {
			if (signal.aborted) throw error;
		}
	}

	if (!signal.aborted) {
		publish({ activeStep: "Notes" });
		try {
			const url = new URL(
				`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/\s+/g, "_"))}`,
			);
			const summary = await getJson(fetcher, url.toString(), signal);
			const extract = cleanHtml(text(summary.extract));
			if (extract) {
				sources.push("Wikipedia summary");
				publish({
					notes: result.notes ?? extract.slice(0, 700),
					tags: result.tags ?? (text(summary.description) || undefined),
				});
			}
		} catch (error) {
			if (signal.aborted) throw error;
		}
	}

	if (!signal.aborted && !result.quotes) {
		publish({ activeStep: "Quotes" });
		try {
			const search = new URL("https://en.wikiquote.org/w/api.php");
			search.searchParams.set("action", "query");
			search.searchParams.set("list", "search");
			search.searchParams.set("srsearch", query);
			search.searchParams.set("format", "json");
			search.searchParams.set("origin", "*");
			const found = await getJson(fetcher, search.toString(), signal);
			const results = (found.query as JsonRecord | undefined)?.search;
			const page = firstRecord(results);
			if (page?.title) {
				const parse = new URL("https://en.wikiquote.org/w/api.php");
				parse.searchParams.set("action", "parse");
				parse.searchParams.set("page", text(page.title));
				parse.searchParams.set("prop", "wikitext");
				parse.searchParams.set("format", "json");
				parse.searchParams.set("origin", "*");
				const parsed = await getJson(fetcher, parse.toString(), signal);
				const wikitext = text(
					(parsed.parse as JsonRecord | undefined)?.wikitext,
				);
				const quote = wikitext
					.split("\n")
					.find((line) => /^\s*\*\s*[^*]/.test(line) && !line.includes("{{"))
					?.replace(/^\s*\*+\s*/, "")
					.replace(/''+/g, "")
					.replace(/\[\[([^|\]]+\|)?([^\]]+)\]\]/g, "$2")
					.trim();
				if (quote) {
					sources.push("Wikiquote");
					publish({ quotes: cleanHtml(quote).slice(0, 240) });
				}
			}
		} catch (error) {
			if (signal.aborted) throw error;
		}
	}

	publish({
		sources,
		status: Object.keys(result).some(
			(key) => !["status", "activeStep", "sources"].includes(key),
		)
			? "complete"
			: "partial",
		activeStep: null,
	});
	return result;
}
