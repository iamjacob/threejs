import type { CSSProperties } from "react";
import type { EnrichmentValues } from "./bookEnrichment";
import { draftCompletion } from "./SideProgress";
import type { ScanDraft } from "./scanDrafts";
import "./scan-draft-roll.css";

function MiniBook({ draft }: { draft: ScanDraft }) {
	const front = draft.faces.front?.image;
	const spine = draft.faces.spine?.image;
	const back = draft.faces.back?.image;
	return (
		<span className="sdr-book" aria-hidden="true">
			<span
				className="sdr-face sdr-front"
				style={front ? { backgroundImage: `url(${front})` } : undefined}
			/>
			<span
				className="sdr-face sdr-spine"
				style={spine ? { backgroundImage: `url(${spine})` } : undefined}
			/>
			<span
				className="sdr-face sdr-back"
				style={back ? { backgroundImage: `url(${back})` } : undefined}
			/>
			<span className="sdr-face sdr-pages" />
		</span>
	);
}

function Ring({ progress }: { progress: number }) {
	const radius = 22;
	const circumference = 2 * Math.PI * radius;
	return (
		<svg className="sdr-ring" viewBox="0 0 48 48" aria-hidden="true">
			<circle cx="24" cy="24" r={radius} className="sdr-ring-track" />
			<circle
				cx="24"
				cy="24"
				r={radius}
				className="sdr-ring-progress"
				strokeDasharray={circumference}
				strokeDashoffset={circumference * (1 - progress)}
				transform="rotate(-90 24 24)"
			/>
		</svg>
	);
}

/**
 * Camera-roll strip of earlier scans: a mini 3D book per draft wrapped in a
 * ring that fills with its completion status. Tap to switch to that book.
 */
export default function ScanDraftRoll({
	drafts,
	onSelect,
	disabled,
}: {
	drafts: (ScanDraft & { enrichment?: EnrichmentValues })[];
	onSelect: (draft: ScanDraft) => void;
	disabled?: boolean;
}) {
	return (
		<nav className="scan-draft-roll" aria-label="Earlier books">
			<ol>
				{drafts.map((draft, index) => {
					const progress = draftCompletion(draft, draft.enrichment);
					const percent = Math.round(progress * 100);
					const title = draft.title || `Untitled book ${drafts.length - index}`;
					return (
						<li key={draft.id}>
							<button
								type="button"
								className={`sdr-item${progress >= 1 ? " is-complete" : ""}`}
								style={{ "--sdr-progress": progress } as CSSProperties}
								disabled={disabled}
								aria-label={`${title}, ${percent}% complete`}
								title={`${title} · ${percent}%`}
								onClick={() => onSelect(draft)}
							>
								<Ring progress={progress} />
								<MiniBook draft={draft} />
								<small>{percent}%</small>
							</button>
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
