import { useState } from "react";
import type { BookOverview } from "../../data/usecases/bookManager";
import { pickImage } from "../../platform/capabilities";
import { useBookManagerStore } from "../../stores/useBookManagerStore";
import DigitalFiles from "./DigitalFiles";
import PageList, { fmtBytes, Preview } from "./PageList";

const sub = "text-xs font-semibold tracking-wide text-slate-400 uppercase";

/** Covers, page scans and failed imports, plus the one real intake path: add a page image. */
export default function ContentPanel({ overview }: { overview: BookOverview }) {
	const busy = useBookManagerStore((s) => s.busy);
	const [pickNote, setPickNote] = useState<string>();
	const addPage = async () => {
		setPickNote(undefined);
		const picked = await pickImage();
		if (picked.status === "cancelled") return;
		if (picked.status !== "ok") {
			setPickNote(
				picked.status === "denied"
					? "Photo access was not allowed."
					: `Could not open photos: ${picked.reason}`,
			);
			return;
		}
		await useBookManagerStore
			.getState()
			.addPage({ ...picked.value, provenance: "device_file" });
	};
	return (
		<section
			aria-labelledby="content-h"
			className="grid gap-4"
			data-testid="content-panel"
		>
			<h2 id="content-h" className="font-medium">
				Content on this device
			</h2>
			<div className="grid gap-1 text-sm">
				<h3 className={sub}>Covers</h3>
				{overview.covers.length === 0 && (
					<p className="text-slate-400">No cover images.</p>
				)}
				<ul className="flex flex-wrap gap-3">
					{overview.covers.map((c) => (
						<li
							key={c.face}
							className="grid gap-1 text-xs"
							data-testid={`cover-${c.face}`}
						>
							{c.source === "file" && (
								<Preview fileId={c.file?.id} alt={`${c.face} cover`} />
							)}
							<span className="capitalize">{c.face}</span>
							<span className="text-slate-400">
								{c.source === "catalog_bundle"
									? "From the bundled catalog"
									: `${c.file?.mimeType} · ${fmtBytes(c.file?.byteSize ?? 0)}${c.bytesOk ? "" : " · missing on device"}`}
							</span>
						</li>
					))}
				</ul>
			</div>
			<div className="grid gap-2 text-sm">
				<h3 className={sub}>Page scans</h3>
				<PageList pages={overview.pages} issues={overview.pageIssues} />
				{overview.failed.map((f) => (
					<p
						key={f.id}
						role="alert"
						data-testid="failed-import"
						className="rounded-xl border border-amber-400/40 p-2 text-xs text-amber-200"
					>
						{f.kind === "digital_file"
							? `${f.originalName ?? "A book file"} could not be saved: ${f.lastError}. Import the same file again to retry, or `
							: `An image could not be saved: ${f.lastError}. Pick the same image again to retry, or `}
						<button
							type="button"
							className="underline"
							onClick={() => void useBookManagerStore.getState().remove(f.id)}
						>
							dismiss
						</button>
						.
					</p>
				))}
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						data-testid="add-page"
						disabled={busy}
						onClick={() => void addPage()}
						className="min-h-11 rounded-full bg-[#d91b24] px-5 font-medium text-white disabled:opacity-50"
					>
						Add a page image
					</button>
					<span className="text-xs text-slate-400">
						JPEG, PNG or WebP, up to 15 MB. Added as the next missing page.
					</span>
				</div>
				{pickNote && (
					<output role="alert" className="text-xs text-amber-300">
						{pickNote}
					</output>
				)}
				<p className="text-xs text-slate-400">
					Removing a page takes it off this book; the image stays in this
					device&apos;s storage until you free it below, so nothing is lost by
					accident.
				</p>
			</div>
			<DigitalFiles overview={overview} />
			<div
				className="grid gap-1 rounded-xl border border-white/10 p-3 text-xs text-slate-300"
				data-testid="no-fetch-note"
			>
				<span className="font-medium text-slate-200">Fetching</span>
				<span>
					No content provider is connected, so BOOOKS cannot download this book
					for you. Add pages by scanning or picking images. Finding a
					book&apos;s details elsewhere does not give the right to download it.
				</span>
			</div>
		</section>
	);
}
