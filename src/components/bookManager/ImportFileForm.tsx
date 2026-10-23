import { type FormEvent, useState } from "react";
import {
	DIGITAL_MAX_BYTES,
	type DigitalRightsBasis,
} from "../../data/usecases/bookFiles";
import { type PickedDocument, pickDocument } from "../../platform/capabilities";
import { useBookManagerStore } from "../../stores/useBookManagerStore";
import { fmtBytes } from "./PageList";

export const RIGHTS: Record<DigitalRightsBasis, string> = {
	public_domain: "Public domain",
	open_license: "Openly licensed (e.g. Creative Commons)",
	purchased_drm_free: "I bought it DRM-free",
	own_work: "My own work",
	other: "Other (describe below)",
};
const ACCEPT = ".epub,.pdf,application/epub+zip,application/pdf";
const btn = "min-h-11 rounded-full px-4 text-sm";
const field = "min-h-11 rounded-lg bg-slate-800 px-3";

/** Pick an EPUB/PDF → state the rights basis and source → save to this device. */
export default function ImportFileForm() {
	const busy = useBookManagerStore((s) => s.busy);
	const [picked, setPicked] = useState<PickedDocument>();
	const [note, setNote] = useState<string>();
	const [rights, setRights] = useState<DigitalRightsBasis | "">("");
	const [source, setSource] = useState("");

	const pick = async () => {
		setNote(undefined);
		const r = await pickDocument(ACCEPT, DIGITAL_MAX_BYTES);
		if (r.status === "cancelled") return;
		if (r.status === "too_large")
			return setNote(
				`${r.name} is ${fmtBytes(r.size)}. EPUB and PDF files can be up to 20 MB.`,
			);
		if (r.status !== "ok")
			return setNote(
				r.status === "denied"
					? "File access was not allowed."
					: `Could not open the file: ${r.reason}`,
			);
		setPicked(r.value);
	};
	const save = async (event: FormEvent) => {
		event.preventDefault();
		if (!picked || !rights) return;
		const ok = await useBookManagerStore.getState().importFile({
			bytes: picked.bytes,
			mimeType: picked.mimeType,
			originalName: picked.name,
			rightsBasis: rights,
			sourceNote: source,
		});
		// On failure the picked file stays, so "Save file" retries the same bytes (one row either way).
		if (ok) {
			setPicked(undefined);
			setRights("");
			setSource("");
		}
	};

	if (!picked)
		return (
			<div className="grid gap-1">
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						data-testid="import-file"
						disabled={busy}
						onClick={() => void pick()}
						className={`${btn} bg-white/10 font-medium disabled:opacity-50`}
					>
						Import EPUB or PDF
					</button>
					<span className="text-xs text-slate-400">
						Up to 20 MB. The original file is kept unchanged.
					</span>
				</div>
				{note && (
					<output
						role="alert"
						data-testid="import-note"
						className="text-xs text-amber-300"
					>
						{note}
					</output>
				)}
			</div>
		);
	return (
		<form
			onSubmit={save}
			data-testid="import-form"
			className="grid gap-2 rounded-xl border border-white/10 p-3"
		>
			<span>
				<span className="font-medium">{picked.name}</span> ·{" "}
				{fmtBytes(picked.bytes.byteLength)}
			</span>
			<label className="grid gap-1">
				Why may you keep this file on this device?
				<select
					data-testid="import-rights"
					required
					className={field}
					value={rights}
					onChange={(e) => setRights(e.target.value as DigitalRightsBasis)}
				>
					<option value="">Choose…</option>
					{Object.entries(RIGHTS).map(([k, v]) => (
						<option key={k} value={k}>
							{v}
						</option>
					))}
				</select>
			</label>
			<label className="grid gap-1">
				Where it came from{rights === "other" ? "" : " (optional)"}
				<input
					data-testid="import-source"
					maxLength={200}
					required={rights === "other"}
					className={field}
					value={source}
					onChange={(e) => setSource(e.target.value)}
				/>
			</label>
			<span className="text-xs text-slate-400">
				Your answer is stored with the file on this device only. BOOOKS does not
				check it, share it or publish the file.
			</span>
			<span className="flex gap-2">
				<button
					type="submit"
					data-testid="import-save"
					disabled={busy || !rights}
					className={`${btn} bg-[#d91b24] font-medium text-white disabled:opacity-50`}
				>
					Save file
				</button>
				<button
					type="button"
					className={`${btn} bg-white/10`}
					onClick={() => setPicked(undefined)}
				>
					Cancel
				</button>
			</span>
		</form>
	);
}
