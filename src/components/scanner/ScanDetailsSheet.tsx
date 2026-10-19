import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { EnrichmentValues } from "./bookEnrichment";

const ROWS: {
	key: keyof EnrichmentValues;
	label: string;
	multiline?: boolean;
}[] = [
	{ key: "title", label: "Title" },
	{ key: "subtitle", label: "Subtitle" },
	{ key: "author", label: "Author" },
	{ key: "isbn", label: "ISBN" },
	{ key: "year", label: "Year" },
	{ key: "language", label: "Language" },
	{ key: "publication", label: "Publisher" },
	{ key: "format", label: "Format" },
	{ key: "dimensions", label: "Size" },
	{ key: "genre", label: "Genre" },
	{ key: "subcategory", label: "Subcategory" },
	{ key: "tags", label: "Tags" },
	{ key: "rating", label: "Rating" },
	{ key: "quotes", label: "Quotes", multiline: true },
	{ key: "notes", label: "Notes", multiline: true },
];

/** Everything the enrichment found, editable in place. */
export default function ScanDetailsSheet({
	enrichment,
	onEdit,
	onClose,
}: {
	enrichment: EnrichmentValues;
	onEdit: (key: keyof EnrichmentValues, value: string) => void;
	onClose: () => void;
}) {
	const sheet = useRef<HTMLElement>(null);
	const id = useId();
	useEffect(() => {
		sheet.current?.querySelector<HTMLElement>("input,textarea")?.focus();
	}, []);
	const filled = ROWS.filter(
		(row) => typeof enrichment[row.key] === "string" && enrichment[row.key],
	).length;
	return (
		<section
			ref={sheet}
			className="scan-details-sheet"
			aria-label="Everything found about this book"
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.stopPropagation();
					onClose();
				}
			}}
		>
			<header>
				<div>
					<h2>Book details</h2>
					<small>
						{filled} of {ROWS.length} found
						{enrichment.sources?.length
							? ` · ${enrichment.sources.join(" · ")}`
							: ""}
					</small>
				</div>
				<button type="button" aria-label="Close details" onClick={onClose}>
					<X size={17} />
				</button>
			</header>
			<div className="scan-details-grid">
				{ROWS.map((row) => {
					const raw = enrichment[row.key];
					const value = typeof raw === "string" ? raw : "";
					const readOnly = row.key === "dimensions" || row.key === "rating";
					const fieldId = `${id}-${row.key}`;
					return (
						<div
							key={row.key}
							className={`scan-details-row${value ? "" : " is-empty"}`}
						>
							<label htmlFor={fieldId}>{row.label}</label>
							{row.multiline ? (
								<textarea
									id={fieldId}
									rows={2}
									value={value}
									readOnly={readOnly}
									placeholder="Not found yet"
									onChange={(event) => onEdit(row.key, event.target.value)}
								/>
							) : (
								<input
									id={fieldId}
									value={value}
									readOnly={readOnly}
									placeholder="Not found yet"
									onChange={(event) => onEdit(row.key, event.target.value)}
								/>
							)}
						</div>
					);
				})}
			</div>
		</section>
	);
}
