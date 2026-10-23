import { useState } from "react";
import type { DigitalRightsBasis } from "../../data/usecases/bookFiles";
import type { BookOverview } from "../../data/usecases/bookManager";
import { useBookManagerStore } from "../../stores/useBookManagerStore";
import ImportFileForm, { RIGHTS } from "./ImportFileForm";
import { fmtBytes } from "./PageList";

const sub = "text-xs font-semibold tracking-wide text-slate-400 uppercase";
const btn = "min-h-11 rounded-full px-4 text-sm";

/** Imported EPUB/PDF files of this book (local only), each with its stated rights and hash. */
export default function DigitalFiles({ overview }: { overview: BookOverview }) {
	const [confirming, setConfirming] = useState<string>();
	return (
		<div className="grid gap-2 text-sm" data-testid="digital-files">
			<h3 className={sub}>Book files (EPUB, PDF)</h3>
			{overview.digitalFiles.length === 0 ? (
				<p className="text-slate-400" data-testid="no-files">
					No book files.
				</p>
			) : (
				<ul className="grid gap-2">
					{overview.digitalFiles.map((f) => (
						<li
							key={f.id}
							data-testid="digital-file"
							className="flex items-center gap-3 rounded-xl bg-white/5 p-2"
						>
							<span className="grid h-12 w-10 place-items-center rounded bg-slate-800 text-[10px] font-semibold uppercase">
								{f.role}
							</span>
							<div className="grid min-w-0 flex-1 gap-0.5 text-xs">
								<span className="truncate text-sm font-medium">
									{f.originalName ?? `${f.role?.toUpperCase()} file`}
								</span>
								<span className="text-slate-400" data-testid="file-rights">
									{fmtBytes(f.byteSize)} ·{" "}
									{RIGHTS[f.rightsBasis as DigitalRightsBasis] ??
										"Rights not stated"}
									{f.sourceNote ? ` · ${f.sourceNote}` : ""}
								</span>
								<span
									className="truncate font-mono text-[10px] text-slate-500"
									title={f.sha256}
								>
									sha256 {f.sha256.slice(0, 16)}…
								</span>
								<span
									data-testid="file-state"
									className={f.bytesOk ? "text-emerald-300" : "text-amber-300"}
								>
									{f.bytesOk
										? "Saved and checked on this device"
										: "File missing on this device"}
								</span>
							</div>
							{confirming === f.id ? (
								<span className="flex gap-1">
									<button
										type="button"
										data-testid="confirm-remove-file"
										className={`${btn} bg-[#d91b24] text-white`}
										onClick={() => {
											setConfirming(undefined);
											void useBookManagerStore.getState().remove(f.id);
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
							) : (
								<button
									type="button"
									data-testid="remove-file"
									aria-label={`Remove ${f.originalName ?? "file"}`}
									className={`${btn} bg-white/10`}
									onClick={() => setConfirming(f.id)}
								>
									Remove
								</button>
							)}
						</li>
					))}
				</ul>
			)}
			<ImportFileForm />
		</div>
	);
}
