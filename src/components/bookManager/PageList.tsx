import { useEffect, useState } from "react";
import type { BookOverview } from "../../data/usecases/bookManager";
import { useBookManagerStore } from "../../stores/useBookManagerStore";
import PageTools from "./PageTools";
import PageViewer from "./PageViewer";

export const fmtBytes = (n: number) =>
	n < 1024
		? `${n} B`
		: n < 1048576
			? `${(n / 1024).toFixed(1)} KB`
			: `${(n / 1048576).toFixed(1)} MB`;
const PROVENANCE: Record<string, string> = {
	device_file: "Picked from this device",
	camera: "Taken with the camera",
	legacy_scan: "From the shelf scanner",
};

/** Local preview from this profile's FileStore (object URL, revoked on unmount). */
export function Preview({
	fileId,
	alt,
}: {
	fileId: string | null | undefined;
	alt: string;
}) {
	const [src, setSrc] = useState<string>();
	useEffect(() => {
		if (!fileId) return;
		let url: string | undefined;
		let live = true;
		void useBookManagerStore
			.getState()
			.previewUrl(fileId)
			.then((u) => {
				url = u;
				if (live) setSrc(u);
				else if (u) URL.revokeObjectURL(u);
			});
		return () => {
			live = false;
			if (url) URL.revokeObjectURL(url);
		};
	}, [fileId]);
	return src ? (
		<img src={src} alt={alt} className="h-20 w-16 rounded object-cover" />
	) : (
		<span className="grid h-20 w-16 place-items-center rounded bg-slate-800 text-[10px] text-slate-400">
			no preview
		</span>
	);
}

const btn = "min-h-11 rounded-full px-3 text-xs";

export default function PageList({
	pages,
	issues,
}: {
	pages: BookOverview["pages"];
	issues?: BookOverview["pageIssues"];
}) {
	const [confirming, setConfirming] = useState<string>();
	const [viewing, setViewing] = useState<number>();
	if (!pages.length)
		return (
			<p className="text-slate-400" data-testid="no-pages">
				No pages scanned yet.
			</p>
		);
	const dupes = new Set(issues?.duplicates ?? []);
	return (
		<>
			{issues &&
				(issues.duplicates.length > 0 || issues.missing.length > 0) && (
					<output
						data-testid="page-issues"
						className="block rounded-xl border border-amber-400/40 p-2 text-xs text-amber-200"
					>
						{issues.duplicates.length > 0 &&
							`More than one scan is numbered ${issues.duplicates.join(", ")}. Give each its own number. `}
						{issues.missing.length > 0 &&
							`No scan yet for page ${listNumbers(issues.missing)}.`}
					</output>
				)}
			<ol className="grid gap-2" data-testid="page-list">
				{pages.map((p, i) => {
					const n = (p.pageIndex ?? 0) + 1;
					const taken = new Set(
						pages
							.filter((o) => o.id !== p.id)
							.map((o) => (o.pageIndex ?? 0) + 1),
					);
					return (
						<li
							key={p.id}
							data-testid="page"
							className="flex flex-wrap items-center gap-3 rounded-xl bg-white/5 p-2"
						>
							<button
								type="button"
								data-testid="page-open"
								aria-label={`View page ${n} full size`}
								className="rounded focus-visible:outline-2 focus-visible:outline-white"
								onClick={() => setViewing(i)}
							>
								<Preview fileId={p.fileId} alt={`Page ${n}`} />
							</button>
							<div className="grid min-w-0 flex-1 gap-0.5 text-xs">
								<span className="text-sm font-medium" data-testid="page-number">
									Page {n}
									{dupes.has(n) && (
										<span className="ml-2 text-xs text-amber-300">
											duplicate number
										</span>
									)}
								</span>
								<span className="text-slate-400">
									{p.mimeType} · {fmtBytes(p.byteSize)} ·{" "}
									{PROVENANCE[p.provenance] ?? p.provenance}
								</span>
								<span
									className="truncate font-mono text-[10px] text-slate-500"
									title={p.sha256}
								>
									sha256 {p.sha256.slice(0, 16)}…
								</span>
								<span
									className={p.bytesOk ? "text-emerald-300" : "text-amber-300"}
								>
									{p.bytesOk
										? "Saved and checked on this device"
										: "File missing on this device"}
								</span>
								<PageTools
									key={`${p.id}:${n}`}
									assetId={p.id}
									pageNumber={n}
									isFirst={i === 0}
									isLast={i === pages.length - 1 && !dupes.has(n)}
									takenBy={taken}
								/>
							</div>
							{confirming === p.id ? (
								<span className="grid gap-1 text-xs">
									<span>Remove page {n} from this book?</span>
									<span className="flex gap-1">
										<button
											type="button"
											data-testid="confirm-remove"
											className={`${btn} bg-[#d91b24] text-white`}
											onClick={() => {
												setConfirming(undefined);
												void useBookManagerStore.getState().remove(p.id);
											}}
										>
											Remove
										</button>
										<button
											type="button"
											className={`${btn} bg-white/10`}
											onClick={() => setConfirming(undefined)}
										>
											Keep
										</button>
									</span>
								</span>
							) : (
								<button
									type="button"
									data-testid="remove-page"
									aria-label={`Remove page ${n}`}
									className={`${btn} bg-white/10`}
									onClick={() => setConfirming(p.id)}
								>
									Remove
								</button>
							)}
						</li>
					);
				})}
			</ol>
			{viewing !== undefined && (
				<PageViewer
					pages={pages}
					index={Math.min(viewing, pages.length - 1)}
					onIndex={setViewing}
					onClose={() => setViewing(undefined)}
				/>
			)}
		</>
	);
}

function listNumbers(numbers: number[]) {
	const shown = numbers.slice(0, 8).join(", ");
	return numbers.length > 8 ? `${shown} and ${numbers.length - 8} more` : shown;
}
