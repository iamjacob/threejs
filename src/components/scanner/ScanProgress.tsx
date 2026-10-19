import { Camera, Check, ListTree, Plus } from "lucide-react";
import {
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { EnrichmentValues } from "./bookEnrichment";
import type { PhotoTag, ScanDraft } from "./scanDrafts";
import "./scan-progress.css";

type Face = "front" | "spine" | "back";
type StepDef = {
	n: string;
	face?: Face;
	h: string;
	s: string;
	k: string;
};

export const PROGRESS_GROUPS: { title: string; steps: StepDef[] }[] = [
	{
		title: "Cover",
		steps: [
			{
				n: "Front",
				face: "front",
				h: "Place the front cover in the frame.",
				s: "Keep all four corners inside the light.",
				k: "Front",
			},
			{
				n: "Spine",
				face: "spine",
				h: "Turn the book on its side.",
				s: "Line the spine up with the frame.",
				k: "Spine",
			},
			{
				n: "Back",
				face: "back",
				h: "Flip to the back cover.",
				s: "Blurb and barcode should both show.",
				k: "Back",
			},
			{
				n: "Barcode/ISBN",
				h: "Get close to the barcode.",
				s: "We read the ISBN straight from the back cover.",
				k: "ISBN",
			},
			{
				n: "Dimensions",
				h: "How big is it?",
				s: "Matched from the ISBN, or drag the rulers.",
				k: "Size",
			},
		],
	},
	{
		title: "Info",
		steps: [
			{
				n: "Title",
				h: "Is this the title?",
				s: "Read from the front cover.",
				k: "Title",
			},
			{
				n: "Author",
				h: "Check the author.",
				s: "Read from the front cover.",
				k: "Author",
			},
			{
				n: "Year",
				h: "When was it published?",
				s: "Matched from the ISBN or title.",
				k: "Year",
			},
			{
				n: "Language",
				h: "Which language?",
				s: "Detected from the edition.",
				k: "Language",
			},
			{
				n: "Publication",
				h: "Who published it?",
				s: "From the edition record.",
				k: "Publisher",
			},
			{
				n: "Format",
				h: "Hardcover or paperback?",
				s: "From the edition record.",
				k: "Format",
			},
		],
	},
	{
		title: "Classification",
		steps: [
			{
				n: "Genre",
				h: "Pick a genre.",
				s: "Suggested from the subjects.",
				k: "Genre",
			},
			{ n: "Subcategory", h: "Narrow it down.", s: "Optional.", k: "Sub" },
			{
				n: "Tags",
				h: "Add a few tags.",
				s: "They make your shelf searchable.",
				k: "Tags",
			},
			{
				n: "Rating",
				h: "How was it?",
				s: "Community rating from Open Library.",
				k: "Rating",
			},
			{
				n: "Quotes",
				h: "Save a line you loved.",
				s: "Pulled from Wikiquote.",
				k: "Quotes",
			},
			{
				n: "Notes",
				h: "Anything to remember?",
				s: "A short summary from Wikipedia.",
				k: "Notes",
			},
		],
	},
];

const TOTAL = PROGRESS_GROUPS.reduce((sum, g) => sum + g.steps.length, 0);
const RING_R = 17;
const RING_C = 2 * Math.PI * RING_R;
const FRAMES = ["⠖", "⠴", "⠦", "⠲"];
const reduced = () =>
	typeof window !== "undefined" &&
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function px(face?: { width: number; height: number }) {
	return face ? `${face.width} × ${face.height} px` : undefined;
}

export function stepValues(
	draft: ScanDraft,
	enrichment?: EnrichmentValues,
	dimensions?: string,
): (string | undefined)[][] {
	return [
		[
			px(draft.faces.front),
			px(draft.faces.spine),
			px(draft.faces.back),
			enrichment?.isbn,
			dimensions ?? enrichment?.dimensions,
		],
		[
			draft.title || enrichment?.title,
			draft.author || enrichment?.author,
			enrichment?.year,
			enrichment?.language,
			enrichment?.publication,
			enrichment?.format,
		],
		[
			enrichment?.genre,
			enrichment?.subcategory,
			enrichment?.tags,
			enrichment?.rating,
			enrichment?.quotes,
			enrichment?.notes,
		],
	];
}

/** Overall completion 0–1 across every tracked step. */
export function draftCompletion(
	draft: ScanDraft,
	enrichment?: EnrichmentValues,
	dimensions?: string,
) {
	const done = stepValues(draft, enrichment, dimensions)
		.flat()
		.filter(Boolean).length;
	return TOTAL ? done / TOTAL : 0;
}

function Loader() {
	const [i, setI] = useState(0);
	useEffect(() => {
		if (reduced()) return;
		const t = window.setInterval(
			() => setI((n) => (n + 1) % FRAMES.length),
			90,
		);
		return () => window.clearInterval(t);
	}, []);
	return (
		<span className="spx-loader" aria-hidden="true">
			{FRAMES[i]}
		</span>
	);
}

/** Slides the old label out and the new one in, direction-aware. */
function SlideTitle({
	text,
	dir,
	loader,
}: {
	text: string;
	dir: number;
	loader: boolean;
}) {
	const [items, setItems] = useState([{ key: 0, text, state: "in" }]);
	const keyRef = useRef(0);
	const first = useRef(true);
	// biome-ignore lint/correctness/useExhaustiveDependencies: animate only when the label text changes.
	useLayoutEffect(() => {
		if (first.current) {
			first.current = false;
			return;
		}
		keyRef.current += 1;
		const key = keyRef.current;
		setItems((prev) => [
			...prev
				.slice(-1)
				.map((it) => ({ ...it, state: dir >= 0 ? "out-up" : "out-down" })),
			{ key, text, state: dir >= 0 ? "from-down" : "from-up" },
		]);
		const raf = requestAnimationFrame(() =>
			requestAnimationFrame(() =>
				setItems((prev) =>
					prev.map((it) => (it.key === key ? { ...it, state: "in" } : it)),
				),
			),
		);
		const t = window.setTimeout(
			() => setItems((prev) => prev.filter((it) => it.key === key)),
			450,
		);
		return () => {
			cancelAnimationFrame(raf);
			window.clearTimeout(t);
		};
	}, [text]);
	return (
		<div className="spx-title" aria-live="polite">
			{items.map((it) => (
				<div key={it.key} className={`spx-line ${it.state}`}>
					{it.text}
					{loader && it.state === "in" && <Loader />}
				</div>
			))}
		</div>
	);
}

function MiniBook({ draft }: { draft: ScanDraft }) {
	const bg = (image?: string) =>
		image ? { backgroundImage: `url(${image})` } : undefined;
	return (
		<span className="spx-book" aria-hidden="true">
			<span
				className="spx-face spx-front"
				style={bg(draft.faces.front?.image)}
			/>
			<span
				className="spx-face spx-spine"
				style={bg(draft.faces.spine?.image)}
			/>
			<span className="spx-face spx-back" style={bg(draft.faces.back?.image)} />
			<span className="spx-face spx-pages" />
		</span>
	);
}

/**
 * Feature flag for the full progress card (ring, step title, counter, segment
 * bar, hint, tools). When false the card shows only the "All details" button
 * that opens the details sheet. Set to `true` to bring everything back.
 */
export const SHOW_SCAN_PROGRESS_FULL = false;

export default function ScanProgress({
	draft,
	enrichment,
	dimensions,
	busy,
	onPart,
	onOpenAll,
	tools,
}: {
	draft: ScanDraft;
	enrichment?: EnrichmentValues;
	/** Formatted physical size from the size store (wins over enrichment). */
	dimensions?: string;
	busy: boolean;
	onPart: (tag: PhotoTag) => void;
	onOpenAll?: () => void;
	/** Extra controls shown in the card footer (e.g. the model picker). */
	tools?: ReactNode;
}) {
	const values = stepValues(draft, enrichment, dimensions);
	const doneCount = values.flat().filter(Boolean).length;
	const finished = doneCount === TOTAL;

	// Current step: the one enrichment is working on, else the first gap.
	let g = 0;
	let s = 0;
	let working = false;
	const active = enrichment?.activeStep;
	outer: for (let gi = 0; gi < PROGRESS_GROUPS.length; gi++) {
		for (let si = 0; si < PROGRESS_GROUPS[gi].steps.length; si++) {
			if (active && PROGRESS_GROUPS[gi].steps[si].n === active) {
				g = gi;
				s = si;
				working = true;
				break outer;
			}
		}
	}
	if (!working) {
		outer2: for (let gi = 0; gi < PROGRESS_GROUPS.length; gi++) {
			for (let si = 0; si < PROGRESS_GROUPS[gi].steps.length; si++) {
				if (!values[gi][si]) {
					g = gi;
					s = si;
					break outer2;
				}
			}
		}
	}

	const [picked, setPicked] = useState<[number, number] | null>(null);
	const shown = picked ?? [g, s];
	const [sg, ss] = shown;
	const step = PROGRESS_GROUPS[sg].steps[ss];
	const shownValue = values[sg][ss];
	const groupDone = values[g].filter(Boolean).length;
	const groupProgress = finished
		? 1
		: groupDone / PROGRESS_GROUPS[g].steps.length;

	// Direction for the sliding title.
	const flat = sg * 100 + ss;
	const prevFlat = useRef(flat);
	const dir = flat >= prevFlat.current ? 1 : -1;
	useEffect(() => {
		prevFlat.current = flat;
	}, [flat]);

	// Forget a manual pick when the book changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on draft switch only.
	useEffect(() => setPicked(null), [draft.id]);

	// Toast when a group fills up.
	const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
	const fullBefore = useRef<boolean[]>(
		PROGRESS_GROUPS.map(
			(group, gi) => values[gi].every(Boolean) && group.steps.length > 0,
		),
	);
	useEffect(() => {
		let timer: number | undefined;
		PROGRESS_GROUPS.forEach((group, gi) => {
			const full = values[gi].every(Boolean);
			if (full && !fullBefore.current[gi]) {
				const all = values.flat().every(Boolean);
				setToast({
					text: all ? `All ${TOTAL} steps done` : `${group.title} complete`,
					id: Date.now(),
				});
				timer = window.setTimeout(() => setToast(null), 1700);
			}
			fullBefore.current[gi] = full;
		});
		return () => {
			if (timer) window.clearTimeout(timer);
		};
	});

	const showAction = step.face && !shownValue && !busy;
	const title = finished
		? "Ready for your shelf"
		: picked
			? step.n
			: PROGRESS_GROUPS[g].steps[s].n;

	return (
		<nav
			className={`spx-card${SHOW_SCAN_PROGRESS_FULL ? "" : " spx-compact"}`}
			aria-label="Scan progress"
		>
			<div className="spx-head">
				{SHOW_SCAN_PROGRESS_FULL && (
					<>
						<div className="spx-ring">
							<svg viewBox="0 0 40 40" aria-hidden="true">
								<circle
									cx="20"
									cy="20"
									r={RING_R}
									fill="none"
									stroke="var(--spx-track)"
									strokeWidth="2.5"
								/>
								<circle
									className="spx-ring-fill"
									cx="20"
									cy="20"
									r={RING_R}
									fill="none"
									stroke={finished ? "var(--spx-ok)" : "var(--spx-accent)"}
									strokeWidth="2.5"
									strokeLinecap="round"
									strokeDasharray={RING_C}
									strokeDashoffset={RING_C * (1 - groupProgress)}
									transform="rotate(-90 20 20)"
								/>
							</svg>
							<span className="spx-ring-num">
								{finished ? <Check size={15} aria-hidden="true" /> : g + 1}
							</span>
						</div>
						<SlideTitle text={title} dir={dir} loader={working && !picked} />
						<div className="spx-count">
							{doneCount}
							<span>/{TOTAL}</span>
						</div>
					</>
				)}
				{onOpenAll && (
					<button
						type="button"
						className="spx-all"
						aria-label="Show everything found about this book"
						title="All details"
						onClick={onOpenAll}
					>
						<ListTree size={15} aria-hidden="true" />
					</button>
				)}
			</div>

			{SHOW_SCAN_PROGRESS_FULL && (
				<>
					<div className="spx-bar">
						{PROGRESS_GROUPS.map((group, gi) => {
							const groupFull = values[gi].every(Boolean);
							return (
								<div
									key={group.title}
									className="spx-cluster"
									style={{ flexGrow: group.steps.length }}
								>
									<div className="spx-segs">
										{group.steps.map((st, si) => {
											const done = Boolean(values[gi][si]);
											const cur = !finished && gi === g && si === s;
											const sel = gi === sg && si === ss;
											return (
												<button
													key={st.n}
													type="button"
													className={`spx-seg${done ? " done" : ""}${cur ? " cur" : ""}${sel ? " sel" : ""}`}
													aria-label={`${group.title}: ${st.n}${values[gi][si] ? ` — ${values[gi][si]}` : ""}`}
													aria-current={cur ? "step" : undefined}
													onClick={() =>
														setPicked((prev) =>
															prev && prev[0] === gi && prev[1] === si
																? null
																: [gi, si],
														)
													}
												/>
											);
										})}
									</div>
									<span
										className={`spx-cl${groupFull ? " ok" : gi === g ? " on" : ""}`}
									>
										{group.title}
									</span>
								</div>
							);
						})}
					</div>

					<div className="spx-detail">
						<div className="spx-hint">
							<div className="h">
								{finished && !picked ? "Book details complete." : step.h}
							</div>
							<div className="sub">
								{finished && !picked
									? "Add it to your shelf when you’re happy with the size."
									: step.s}
							</div>
						</div>
						{showAction ? (
							<button
								type="button"
								className="spx-chip spx-chip-action"
								onClick={() => step.face && onPart(step.face)}
							>
								<Camera size={13} aria-hidden="true" />
								Add {step.n.toLowerCase()}
							</button>
						) : (
							<div className={`spx-chip${shownValue ? " ok" : ""}`}>
								<i />
								<span className="k">{step.k}</span>
								<span className="v">
									{shownValue ?? (working && !picked ? "Looking…" : "Pending")}
								</span>
							</div>
						)}
					</div>
					{tools && <div className="spx-tools">{tools}</div>}

					<output className={`spx-toast${toast ? " show" : ""}`}>
						<i>
							<Check size={13} strokeWidth={3.2} aria-hidden="true" />
						</i>
						<span>{toast?.text}</span>
					</output>
				</>
			)}
		</nav>
	);
}

/**
 * Bottom dock: the current book plus every earlier draft as mini 3D books
 * inside completion rings, and a "new book" button. Lives at the foot of the
 * scanner, separate from the progress card at the top.
 */
export function ScanHistoryDock({
	current,
	currentEnrichment,
	earlier,
	busy,
	onSelectDraft,
	onNewDraft,
}: {
	current: ScanDraft;
	currentEnrichment?: EnrichmentValues;
	earlier: ScanDraft[];
	busy: boolean;
	onSelectDraft: (draft: ScanDraft) => void;
	onNewDraft: () => void;
}) {
	const items = [
		{ draft: current, enrichment: currentEnrichment, active: true },
		...earlier.map((draft) => ({
			draft,
			enrichment: draft.enrichment,
			active: false,
		})),
	];
	return (
		<nav className="spx-dock" aria-label="Your books in this session">
			<button
				type="button"
				className="spx-new"
				disabled={busy}
				aria-label="Start a new book"
				title="New book"
				onClick={onNewDraft}
			>
				<Plus size={16} aria-hidden="true" />
				<span>New</span>
			</button>
			<ol>
				{items.map(({ draft, enrichment, active }, index) => {
					const progress = draftCompletion(draft, enrichment);
					const percent = Math.round(progress * 100);
					const name =
						draft.title || (active ? "This book" : `Untitled book ${index}`);
					return (
						<li key={draft.id}>
							<button
								type="button"
								className={`spx-item${progress >= 1 ? " is-complete" : ""}${active ? " is-active" : ""}`}
								disabled={busy || active}
								aria-current={active ? "true" : undefined}
								aria-label={`${name}, ${percent}% complete`}
								title={`${name} · ${percent}%`}
								onClick={() => onSelectDraft(draft)}
							>
								<svg viewBox="0 0 40 40" aria-hidden="true">
									<circle cx="20" cy="20" r={RING_R} className="t" />
									<circle
										cx="20"
										cy="20"
										r={RING_R}
										className="f"
										strokeDasharray={RING_C}
										strokeDashoffset={RING_C * (1 - progress)}
										transform="rotate(-90 20 20)"
									/>
								</svg>
								<MiniBook draft={draft} />
							</button>
							<small>{active ? "Now" : `${percent}%`}</small>
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
