import assert from "node:assert/strict";
import { test } from "node:test";
import {
	enrichBookMetadata,
	findCatalogMatch,
	normalizeIsbn,
	parsePhysicalDimensions,
	physicalSizeToWorldDimensions,
} from "../src/components/scanner/bookEnrichment.ts";

const response = (body) => ({ ok: true, json: async () => body });

test("book metadata enrichment combines Open Library, edition, Google Books, Wikipedia, and Wikiquote", async () => {
	const requested = [];
	const fetcher = async (input) => {
		const url = new URL(input);
		requested.push(url);
		if (url.hostname === "openlibrary.org" && url.pathname === "/search.json")
			return response({ docs: [{ key: "/works/OL1W", edition_key: ["OL1M"], title: "Example Book", author_name: ["A. Writer"], first_publish_year: 1965, isbn: ["9781234567890"], language: ["eng"], publisher: ["Press"], publish_place: ["London"], number_of_pages_median: 240, subject: ["Fiction", "Adventure"], ratings_average: 4.2, ratings_count: 100 }] });
		if (url.hostname === "openlibrary.org" && url.pathname === "/works/OL1W.json")
			return response({ description: { value: "A story about a long journey." }, subjects: ["Fiction", "Adventure", "Journeys"] });
		if (url.pathname === "/books/OL1M.json")
			return response({ physical_dimensions: "21 x 14 x 2 cm", physical_format: "Paperback", number_of_pages: 240, publishers: ["Press"] });
		if (url.hostname === "www.googleapis.com" && url.pathname === "/books/v1/volumes")
			return response({ items: [{ volumeInfo: { publishedDate: "1965", language: "en", publisher: "Press", pageCount: 240, categories: ["Fiction / Adventure"], averageRating: 4.1, ratingsCount: 90, description: "A Google synopsis." } }] });
		if (url.pathname.startsWith("/api/rest_v1/page/summary/"))
			return response({ extract: "A Wikipedia summary." });
		if (url.hostname === "en.wikiquote.org" && url.searchParams.get("action") === "query")
			return response({ query: { search: [{ title: "Example Book" }] } });
		if (url.hostname === "en.wikiquote.org" && url.searchParams.get("action") === "parse")
			return response({ parse: { wikitext: "* ''The road goes ever on.''" } });
		throw new Error(`Unexpected URL: ${url}`);
	};
	const updates = [];
	const result = await enrichBookMetadata("Example Book", "A. Writer", {
		signal: new AbortController().signal,
		fetcher,
		onUpdate: (update) => updates.push(update),
	});
	assert.equal(result.year, "1965");
	assert.equal(result.language, "English");
	assert.equal(result.isbn, "9781234567890");
	assert.match(result.dimensions, /21 × 14 × 2 cm/);
	assert.deepEqual(result.physicalSize, {
		widthCm: 14,
		heightCm: 21,
		thicknessCm: 2,
		source: "Open Library edition",
	});
	assert.equal(result.genre, "Fiction");
	assert.equal(result.subcategory, "Adventure");
	assert.match(result.notes, /long journey/);
	assert.match(result.quotes, /road goes ever on/);
	assert.equal(result.status, "complete");
	assert.ok(result.sources.includes("Open Library"));
	assert.ok(result.sources.includes("Google Books"));
	assert.ok(result.sources.includes("Wikiquote"));
	assert.ok(updates.some((update) => update.activeStep === "Notes"));
	assert.ok(requested.some((url) => url.hostname === "en.wikipedia.org"));
});

test("lookup failures leave a usable partial result and title-only lookup is supported", async () => {
	const result = await enrichBookMetadata("Unknown title", "", {
		signal: new AbortController().signal,
		fetcher: async () => { throw new Error("offline"); },
	});
	assert.equal(result.status, "partial");
	assert.equal(result.activeStep, null);
	assert.deepEqual(result.sources, []);
});

test("catalog matching prefers ISBN and safely falls back to matching title plus author", () => {
	const entries = [
		{ title: "Seneca", author: "Seneca", isbn: "9780141018812", language: "en", size: { width: 11, height: 18, thickness: 0.7 }, weight: 76 },
		{ title: "Seneca", author: "Another writer", isbn: "9780000000000", size: { width: 20, height: 30, thickness: 2 } },
	];
	assert.equal(normalizeIsbn("978-0-141-01881-2"), "9780141018812");
	assert.equal(findCatalogMatch(entries, "Different title", "", "9780141018812").author, "Seneca");
	assert.equal(findCatalogMatch(entries, "seneca", "seneca").isbn, "9780141018812");
	assert.equal(findCatalogMatch(entries, "Seneca", "Unknown author"), undefined);
	assert.deepEqual(parsePhysicalDimensions("21 × 14 × 2 cm", "test"), {
		widthCm: 14, heightCm: 21, thicknessCm: 2, source: "test",
	});
	assert.equal(parsePhysicalDimensions("8.3 × 5.2 × 0.8 in", "test").heightCm, 21.082);
	assert.deepEqual(parsePhysicalDimensions("21 × 14 cm", "test"), {
		widthCm: 14,
		heightCm: 21,
		source: "test",
	});
	assert.deepEqual(physicalSizeToWorldDimensions({ widthCm: 14, heightCm: 21, thicknessCm: 2, source: "test" }), [14 / 30, 21 / 30, 2 / 30]);
});

test("matching local ISBN catalog record provides physical size and language before web lookups", async () => {
	const requests = [];
	const result = await enrichBookMetadata("Seneca", "Seneca", {
		signal: new AbortController().signal,
		catalog: [
			{ title: "Seneca", author: "Seneca", isbn: "978-0-141-01881-2", subtitle: "On the Shortness of Life", language: "en", publisher: "Penguin", format: "Paperback", pages: 106, size: { width: 11, height: 18, thickness: 0.7 }, weight: 76 },
		],
		isbn: "9780141018812",
		fetcher: async (input) => {
			requests.push(new URL(input));
			return response({ docs: [] });
		},
	});
	assert.deepEqual(result.physicalSize, {
		widthCm: 11,
		heightCm: 18,
		thicknessCm: 0.7,
		weightGrams: 76,
		source: "Local catalog · ISBN edition",
	});
	assert.match(result.dimensions, /18 × 11 × 0.7 cm/);
	assert.equal(result.language, "English");
	assert.equal(result.subtitle, "On the Shortness of Life");
	assert.ok(result.sources.includes("Local catalog"));
	assert.equal(requests[0].searchParams.get("isbn"), "978-0-141-01881-2");
});
