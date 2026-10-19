import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import type { EnrichmentValues } from "./bookEnrichment";
import type { ScanDraft } from "./scanDrafts";
import "./side-progress.css";

type Group = {
	title: string;
	steps: string[];
	values: (string | undefined)[];
	progress: number;
	check: boolean;
	loaderOn: number | null;
};

const GROUPS: { title: string; steps: string[] }[] = [
	{
		title: "Cover",
		steps: ["Front", "Spine", "Back", "Barcode/ISBN", "Dimensions"],
	},
	{
		title: "Info",
		steps: ["Title", "Author", "Year", "Language", "Publication", "Format"],
	},
	{
		title: "Classification",
		steps: ["Genre", "Subcategory", "Tags", "Rating", "Quotes", "Notes"],
	},
];

function progressGroups(
	draft: ScanDraft,
	enrichment?: EnrichmentValues,
): Group[] {
	const coverValues = [
		draft.faces.front
			? `${draft.faces.front.width} × ${draft.faces.front.height} px`
			: undefined,
		draft.faces.spine
			? `${draft.faces.spine.width} × ${draft.faces.spine.height} px`
			: undefined,
		draft.faces.back
			? `${draft.faces.back.width} × ${draft.faces.back.height} px`
			: undefined,
		enrichment?.isbn,
		enrichment?.dimensions ??
			(draft.faces.front
				? `Image ratio ${(draft.faces.front.width / draft.faces.front.height).toFixed(2)} · physical size unavailable`
				: undefined),
	];
	const values: Record<string, (string | undefined)[]> = {
		Cover: coverValues,
		Info: [
			draft.title || enrichment?.title,
			draft.author || enrichment?.author,
			enrichment?.year,
			enrichment?.language,
			enrichment?.publication,
			enrichment?.format,
		],
		Classification: [
			enrichment?.genre,
			enrichment?.subcategory,
			enrichment?.tags,
			enrichment?.rating,
			enrichment?.quotes,
			enrichment?.notes,
		],
	};
	return GROUPS.map((group) => {
		const groupValues = values[group.title] ?? [];
		const complete = groupValues.filter(Boolean).length;
		const active = enrichment?.activeStep;
		const loaderOn = group.steps.indexOf(active ?? "");
		return {
			...group,
			values: groupValues,
			progress: complete / group.steps.length,
			check: complete === group.steps.length,
			loaderOn: loaderOn < 0 ? null : loaderOn,
		};
	});
}

/** Overall completion 0–1 across every tracked step, for the camera-roll rings. */
export function draftCompletion(
	draft: ScanDraft,
	enrichment?: EnrichmentValues,
) {
	const groups = progressGroups(draft, enrichment);
	const total = groups.reduce((sum, group) => sum + group.steps.length, 0);
	const done = groups.reduce(
		(sum, group) => sum + group.values.filter(Boolean).length,
		0,
	);
	return total ? done / total : 0;
}

function ProgressRing({
	progress,
	check,
}: {
	progress: number;
	check: boolean;
}) {
	const radius = 11;
	const circumference = 2 * Math.PI * radius;
	return (
		<svg
			className="sp-ring"
			viewBox="0 0 24 24"
			role="img"
			aria-label={`${Math.round(progress * 100)}% complete`}
		>
			<circle
				cx="12"
				cy="12"
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeOpacity=".16"
				strokeWidth="2"
			/>
			<circle
				className="sp-ring-progress"
				cx="12"
				cy="12"
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeDasharray={circumference}
				strokeDashoffset={circumference * (1 - progress)}
				strokeLinecap="round"
				transform="rotate(-90 12 12)"
			/>
			{check && <Check className="sp-check" size={13} aria-hidden="true" />}
		</svg>
	);
}

const LOADER_FRAMES = ["⠖", "⠴", "⠦", "⠲"];

function Loader() {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		const timer = window.setInterval(
			() => setFrame((index) => (index + 1) % LOADER_FRAMES.length),
			100,
		);
		return () => window.clearInterval(timer);
	}, []);
	return (
		<i className="sp-loader" aria-hidden="true">
			{LOADER_FRAMES[frame]}
		</i>
	);
}

export default function SideProgress({
	draft,
	enrichment,
}: {
	draft: ScanDraft;
	enrichment?: EnrichmentValues;
}) {
	const groups = progressGroups(draft, enrichment);
	return (
		<article
			className="side-progress is-active"
			aria-label={`Progress for ${draft.title || "untitled book"}`}
		>
			<header className="sp-book-title">
				<span>{draft.title || "Untitled book"}</span>
				<small>
					{enrichment?.status === "searching"
						? "Enriching metadata…"
						: `${groups[0].check && groups[1].check && groups[2].check ? "Complete" : "Book details"}`}
				</small>
			</header>
			{groups.map((group) => (
				<section className="sp-group" key={group.title}>
					<header className="sp-group-heading">
						<ProgressRing progress={group.progress} check={group.check} />
						<strong>{group.title}</strong>
						<span>{Math.round(group.progress * 100)}%</span>
					</header>
					<ol className="sp-steps">
						{group.steps.map((step, index) => {
							const value = group.values[index];
							return (
								<li
									key={step}
									className={value ? "is-complete" : ""}
									title={value}
								>
									<span>{step}</span>
									{value && <small>{value}</small>}
									{group.loaderOn === index && <Loader />}
								</li>
							);
						})}
					</ol>
				</section>
			))}
			{enrichment?.sources?.length ? (
				<p className="sp-sources">Sources: {enrichment.sources.join(" · ")}</p>
			) : null}
		</article>
	);
}
