import { useBookManagerStore } from "../../stores/useBookManagerStore";
import { fmtBytes } from "./PageList";

const btn = "min-h-11 rounded-full px-4 text-sm";

/**
 * Explicit, two-step storage cleanup for the person using this device: "Check" (read-only) shows
 * what could be freed, and only "Free … now" deletes. Only bytes of pages/files this person removed
 * and that nothing on this device still uses are freed.
 */
export default function StorageCleanup() {
	const busy = useBookManagerStore((s) => s.busy);
	const plan = useBookManagerStore((s) => s.cleanupPlan);
	const result = useBookManagerStore((s) => s.cleanupResult);
	const s = useBookManagerStore.getState;
	return (
		<section
			aria-labelledby="cleanup-h"
			className="grid gap-2 rounded-xl border border-white/10 p-3 text-sm"
			data-testid="storage-cleanup"
		>
			<h2 id="cleanup-h" className="font-medium">
				Storage on this device
			</h2>
			<p className="text-xs text-slate-400">
				Removed pages and files stay on this device until you free them here.
				Anything still used by a book, cover or note, or by anyone else on this
				device, is always kept.
			</p>
			{plan ? (
				plan.blobs.length === 0 ? (
					<p data-testid="cleanup-nothing">
						Nothing to free.
						{plan.keptInUse > 0 &&
							` ${plan.keptInUse} removed item${plan.keptInUse === 1 ? " is" : "s are"} still in use and kept.`}{" "}
						<button
							type="button"
							className="underline"
							onClick={() => s().cancelCleanup()}
						>
							Close
						</button>
					</p>
				) : (
					<div
						className="grid gap-2"
						role="alertdialog"
						aria-labelledby="cleanup-q"
					>
						<p id="cleanup-q" data-testid="cleanup-plan">
							Free {fmtBytes(plan.totalBytes)} by deleting {plan.blobs.length}{" "}
							removed item{plan.blobs.length === 1 ? "" : "s"}? This cannot be
							undone.
							{plan.keptInUse > 0 &&
								` ${plan.keptInUse} still in use will be kept.`}
						</p>
						<span className="flex gap-2">
							<button
								type="button"
								data-testid="cleanup-confirm"
								disabled={busy}
								className={`${btn} bg-[#d91b24] text-white disabled:opacity-50`}
								onClick={() => void s().confirmCleanup()}
							>
								Free {fmtBytes(plan.totalBytes)} now
							</button>
							<button
								type="button"
								data-testid="cleanup-cancel"
								className={`${btn} bg-white/10`}
								onClick={() => s().cancelCleanup()}
							>
								Keep everything
							</button>
						</span>
					</div>
				)
			) : (
				<button
					type="button"
					data-testid="cleanup-check"
					disabled={busy}
					className={`${btn} justify-self-start bg-white/10 disabled:opacity-50`}
					onClick={() => void s().planCleanup()}
				>
					Check for space to free
				</button>
			)}
			{result && (
				<output
					data-testid="cleanup-result"
					className="text-xs text-emerald-300"
				>
					Freed {fmtBytes(result.freedBytes)} ({result.freed} item
					{result.freed === 1 ? "" : "s"}).
					{result.skipped > 0 &&
						` ${result.skipped} kept because ${result.skipped === 1 ? "it is" : "they are"} in use again.`}
					{result.failed.length > 0 &&
						` ${result.failed.length} could not be deleted and ${result.failed.length === 1 ? "is" : "are"} still on this device.`}
				</output>
			)}
		</section>
	);
}
