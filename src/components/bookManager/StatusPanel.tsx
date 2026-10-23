import type {
	BookStatus,
	ContentState,
	RemoteState,
} from "../../data/usecases/bookStatus";

const card = "grid gap-1 rounded-xl bg-white/5 p-3";
const label = "text-xs font-semibold tracking-wide text-slate-400 uppercase";

export function contentText(c: ContentState): string {
	switch (c.kind) {
		case "none":
			return "No content yet: no covers or pages on this device.";
		case "metadata_only":
			return `Details and ${c.covers} cover image${c.covers === 1 ? "" : "s"} only; no pages.`;
		case "partial":
			return c.expected === null
				? `${c.pages} page${c.pages === 1 ? "" : "s"} scanned. Set the page count to know whether it is complete.`
				: `${c.pages} of ${c.expected} pages scanned. Missing: ${missingText(c.missing)}.`;
		case "complete":
			return `All ${c.expected} pages scanned and checked on this device.`;
	}
}

function missingText(missing: number[]) {
	const shown = missing
		.slice(0, 8)
		.map((i) => i + 1)
		.join(", ");
	return missing.length > 8 ? `${shown} and ${missing.length - 8} more` : shown;
}

export function remoteText(r: RemoteState): string {
	switch (r.kind) {
		case "not_configured":
			return "Local only · sync not configured";
		case "local_only":
			return "Local only · not sent yet";
		case "synced":
			return "Synced";
		case "changed_since_sync":
			return "Changed since last sync";
	}
}

const CATALOG: Record<BookStatus["catalogIdentity"], string> = {
	unmatched: "Not matched to a catalog edition",
	candidate:
		"Linked to the bundled BOOOKS catalog (not independently verified)",
	verified: "Verified edition",
};

/**
 * Independent status dimensions. They are never combined into one "synced"/"complete" flag.
 * Registration and chain show their fixed state: no registry or chain integration exists.
 */
export default function StatusPanel({ status }: { status: BookStatus }) {
	return (
		<section
			aria-labelledby="status-h"
			className="grid gap-2"
			data-testid="status-panel"
		>
			<h2 id="status-h" className="font-medium">
				Status
			</h2>
			<div className="grid gap-2 sm:grid-cols-2">
				<div className={card}>
					<span className={label}>On this device</span>
					<span data-testid="status-local">
						{status.localRecord === "saved" ? "Saved" : "Needs attention"}
					</span>
					{status.attention.map((a) => (
						<span key={a} className="text-xs text-amber-300">
							{a}
						</span>
					))}
				</div>
				<div className={card}>
					<span className={label}>Sync</span>
					<span data-testid="status-sync">
						{remoteText(status.remote.metadata)}
					</span>
					<span className="text-xs text-slate-400">
						Nothing is sent to other devices or a server.
					</span>
				</div>
				<div className={card}>
					<span className={label}>Content</span>
					<span data-testid="status-content" data-kind={status.content.kind}>
						{contentText(status.content)}
					</span>
				</div>
				<div className={card}>
					<span className={label}>Catalog identity</span>
					<span data-testid="status-catalog">
						{CATALOG[status.catalogIdentity]}
					</span>
				</div>
				<div className={card}>
					<span className={label}>Public registration</span>
					<span data-testid="status-registration">Not proposed</span>
				</div>
				<div className={card}>
					<span className={label}>Chain publication</span>
					<span data-testid="status-chain">Not submitted</span>
				</div>
			</div>
		</section>
	);
}
