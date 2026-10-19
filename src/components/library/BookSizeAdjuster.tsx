import { RotateCcw, Ruler } from "lucide-react";
import { useEffect } from "react";
import type { LibraryBook } from "../../lib/bookCatalog";
import {
	BOOK_SIZE_LIMITS_CM,
	type BookSizeCm,
	CM_PER_WORLD_UNIT,
	clampBookSize,
	formatMeasurement,
	useBookSizeStore,
} from "../../stores/useBookSizeStore";
import { useBookStore } from "../../stores/useBookStore";
import { saveScannedBook } from "../scanner/scannedBook";

const AXES: { key: keyof BookSizeCm; label: string }[] = [
	{ key: "height", label: "Height" },
	{ key: "width", label: "Width" },
	{ key: "thickness", label: "Spine" },
];

function bookSizeCm(book: LibraryBook): BookSizeCm {
	const [width, height, thickness] = book.dimensions;
	return clampBookSize({
		width: width * CM_PER_WORLD_UNIT,
		height: height * CM_PER_WORLD_UNIT,
		thickness: thickness * CM_PER_WORLD_UNIT,
	});
}

/**
 * Second place to adjust a book's physical size: the info card on the shelf.
 * Shares the scanner's store, so an edit here matches the scanner's rulers and
 * resizes the 3D book on the shelf immediately.
 */
export default function BookSizeAdjuster({ book }: { book: LibraryBook }) {
	const unit = useBookSizeStore((state) => state.unit);
	const setUnit = useBookSizeStore((state) => state.setUnit);
	const entry = useBookSizeStore((state) => state.entries[book.id]);
	const applyEnrichment = useBookSizeStore((state) => state.applyEnrichment);
	const setSize = useBookSizeStore((state) => state.setSize);
	const reset = useBookSizeStore((state) => state.reset);
	const resizeBook = useBookStore((state) => state.resizeBook);
	const scanned = book.id.startsWith("scan-");

	// Seed the store from the shelf book the first time it is viewed.
	useEffect(() => {
		if (!entry)
			applyEnrichment(
				book.id,
				bookSizeCm(book),
				book.enrichment?.physicalSize?.source ??
					(scanned ? "Scanned estimate" : "Catalog size"),
			);
	}, [applyEnrichment, book, entry, scanned]);

	// Push store edits to the 3D book (and persist scanned ones).
	useEffect(() => {
		if (!entry) return;
		const next = resizeBook(book.id, [
			entry.size.width / CM_PER_WORLD_UNIT,
			entry.size.height / CM_PER_WORLD_UNIT,
			entry.size.thickness / CM_PER_WORLD_UNIT,
		]);
		if (next && next !== book && scanned)
			void saveScannedBook(next).catch(() => {});
	}, [book, entry, resizeBook, scanned]);

	const size = entry?.size ?? bookSizeCm(book);
	const toDisplay = (cm: number) => (unit === "cm" ? cm : cm / 2.54);
	const fromDisplay = (value: number) => (unit === "cm" ? value : value * 2.54);
	return (
		<section className="book-size-adjuster" aria-label="Book size">
			<header>
				<Ruler size={14} aria-hidden="true" />
				<span>
					Size
					<small>
						{entry?.overridden
							? "Adjusted manually"
							: (entry?.source ?? "Catalog size")}
					</small>
				</span>
				<fieldset className="book-size-unit">
					<legend className="sr-only">Units</legend>
					{(["cm", "in"] as const).map((choice) => (
						<button
							key={choice}
							type="button"
							aria-pressed={unit === choice}
							onClick={() => setUnit(choice)}
						>
							{choice}
						</button>
					))}
				</fieldset>
			</header>
			{AXES.map(({ key, label }) => (
				<label className="book-size-range" key={key}>
					<span>
						{label}
						<output>{formatMeasurement(size[key], unit)}</output>
					</span>
					<input
						type="range"
						min={toDisplay(BOOK_SIZE_LIMITS_CM[key][0])}
						max={toDisplay(BOOK_SIZE_LIMITS_CM[key][1])}
						step={unit === "cm" ? 0.1 : 1 / 8}
						value={toDisplay(size[key])}
						onChange={(event) =>
							setSize(book.id, {
								[key]: fromDisplay(Number(event.target.value)),
							})
						}
					/>
				</label>
			))}
			{entry?.overridden && (
				<button
					type="button"
					className="book-size-reset"
					onClick={() => reset(book.id)}
				>
					<RotateCcw size={14} aria-hidden="true" />
					<span>Reset size</span>
				</button>
			)}
		</section>
	);
}
