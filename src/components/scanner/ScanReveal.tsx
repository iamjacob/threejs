import { Check, Pencil, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EnrichmentValues } from "./bookEnrichment";
import "./scan-reveal.css";

type Field = {
	key: keyof EnrichmentValues;
	label: string;
	/** Which draft field this writes back to when edited. */
	editable: boolean;
};

const FIELDS: Field[] = [
	{ key: "title", label: "Title", editable: true },
	{ key: "subtitle", label: "Subtitle", editable: true },
	{ key: "author", label: "Author", editable: true },
	{ key: "isbn", label: "ISBN", editable: true },
	{ key: "year", label: "Year", editable: true },
	{ key: "language", label: "Language", editable: true },
	{ key: "publication", label: "Publisher", editable: true },
	{ key: "format", label: "Format", editable: true },
	{ key: "dimensions", label: "Size", editable: false },
	{ key: "genre", label: "Genre", editable: true },
	{ key: "subcategory", label: "Subcategory", editable: true },
	{ key: "tags", label: "Tags", editable: true },
	{ key: "rating", label: "Rating", editable: false },
	{ key: "quotes", label: "Quote", editable: true },
	{ key: "notes", label: "Notes", editable: true },
];

type Card = { key: keyof EnrichmentValues; label: string; value: string };

const SHOW_MS = 4200;
const FADE_MS = 420;

/**
 * "AI-ish" reveal: every newly identified field rolls in on the overlay as
 * `Title identified as: …`, lingers, then fades. Tap to edit; the value is
 * written back through `onEdit`. Shows one card at a time, in arrival order.
 */
export default function ScanReveal({
	draftId,
	enrichment,
	onEdit,
	onOpenAll,
}: {
	draftId: string;
	enrichment: EnrichmentValues;
	onEdit: (key: keyof EnrichmentValues, value: string) => void;
	onOpenAll: () => void;
}) {
	const seen = useRef<Map<string, string>>(new Map());
	const queue = useRef<Card[]>([]);
	const [card, setCard] = useState<Card | null>(null);
	const [phase, setPhase] = useState<"in" | "out">("in");
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState("");
	const timers = useRef<number[]>([]);
	const reduced =
		typeof window !== "undefined" &&
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

	const clearTimers = useCallback(() => {
		for (const id of timers.current) window.clearTimeout(id);
		timers.current = [];
	}, []);

	// New draft → forget what we've shown.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset per draft.
	useEffect(() => {
		seen.current = new Map();
		queue.current = [];
		clearTimers();
		setCard(null);
		setEditing(false);
	}, [draftId]);

	// Diff enrichment → enqueue newly found / changed values.
	useEffect(() => {
		for (const field of FIELDS) {
			const raw = enrichment[field.key];
			if (typeof raw !== "string" || !raw.trim()) continue;
			const text = raw.trim();
			if (seen.current.get(field.key) === text) continue;
			seen.current.set(field.key, text);
			queue.current = queue.current.filter((item) => item.key !== field.key);
			queue.current.push({ key: field.key, label: field.label, value: text });
		}
		if (!card && queue.current.length) {
			const next = queue.current.shift();
			if (next) {
				setCard(next);
				setPhase("in");
			}
		}
	}, [enrichment, card]);

	// Auto-dismiss unless the user is editing.
	useEffect(() => {
		if (!card || editing) return;
		clearTimers();
		timers.current.push(
			window.setTimeout(() => setPhase("out"), SHOW_MS),
			window.setTimeout(() => setCard(null), SHOW_MS + (reduced ? 0 : FADE_MS)),
		);
		return clearTimers;
	}, [card, editing, reduced, clearTimers]);

	useEffect(() => clearTimers, [clearTimers]);

	if (!card) return null;
	const field = FIELDS.find((item) => item.key === card.key);
	const canEdit = field?.editable ?? false;

	const dismiss = () => {
		clearTimers();
		setEditing(false);
		setPhase("out");
		timers.current.push(
			window.setTimeout(() => setCard(null), reduced ? 0 : FADE_MS),
		);
	};
	const save = () => {
		const next = value.trim();
		if (next && next !== card.value) {
			seen.current.set(card.key, next);
			onEdit(card.key, next);
		}
		dismiss();
	};

	return (
		<output
			className={`scan-reveal ${phase}${editing ? " is-editing" : ""}`}
			aria-live="polite"
		>
			<Sparkles size={14} className="scan-reveal-spark" aria-hidden="true" />
			{editing ? (
				<form
					className="scan-reveal-edit"
					onSubmit={(event) => {
						event.preventDefault();
						save();
					}}
				>
					<label>
						<span>{card.label}</span>
						<input
							// biome-ignore lint/a11y/noAutofocus: the user just tapped this card to edit it.
							autoFocus
							value={value}
							maxLength={300}
							onChange={(event) => setValue(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Escape") {
									event.stopPropagation();
									dismiss();
								}
							}}
						/>
					</label>
					<button type="submit" aria-label="Save">
						<Check size={15} />
					</button>
					<button type="button" aria-label="Cancel" onClick={dismiss}>
						<X size={15} />
					</button>
				</form>
			) : (
				<button
					type="button"
					className="scan-reveal-body"
					title={canEdit ? "Tap to edit" : "Tap to see everything found"}
					onClick={() => {
						if (canEdit) {
							setValue(card.value);
							setEditing(true);
						} else onOpenAll();
					}}
				>
					<span className="scan-reveal-k">{card.label} identified as</span>
					<span className="scan-reveal-v">{card.value}</span>
					{canEdit && (
						<Pencil size={12} className="scan-reveal-pen" aria-hidden="true" />
					)}
				</button>
			)}
			{!editing && (
				<button type="button" className="scan-reveal-all" onClick={onOpenAll}>
					All details
				</button>
			)}
		</output>
	);
}
