import { type FormEvent, useState } from "react";
import { useBookManagerStore } from "../../stores/useBookManagerStore";

const btn =
	"min-h-11 min-w-11 rounded-full bg-white/10 px-3 text-xs disabled:opacity-40";

/**
 * Explicit page number + move earlier/later for one page. A number that another scan already has
 * is never silently overwritten: the person is asked whether to swap the two pages.
 */
export default function PageTools({
	assetId,
	pageNumber,
	isFirst,
	isLast,
	takenBy,
}: {
	assetId: string;
	pageNumber: number;
	isFirst: boolean;
	isLast: boolean;
	/** Page numbers used by OTHER scans of this book (1-based). */
	takenBy: ReadonlySet<number>;
}) {
	const busy = useBookManagerStore((s) => s.busy);
	const [value, setValue] = useState(String(pageNumber));
	const [askSwap, setAskSwap] = useState<number>();
	const store = useBookManagerStore.getState;

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const n = Number(value);
		if (!Number.isInteger(n) || n < 1) return;
		if (n === pageNumber) return;
		if (takenBy.has(n)) return setAskSwap(n);
		if (!(await store().renumberPage(assetId, n))) setValue(String(pageNumber));
	};
	const swap = async () => {
		if (askSwap === undefined) return;
		setAskSwap(undefined);
		if (!(await store().renumberPage(assetId, askSwap, true)))
			setValue(String(pageNumber));
	};

	return (
		<div className="grid gap-1">
			<form onSubmit={submit} className="flex flex-wrap items-center gap-1">
				<label className="flex items-center gap-1 text-xs">
					<span className="sr-only">Page number</span>
					#
					<input
						data-testid="page-number-input"
						aria-label={`Page number for page ${pageNumber}`}
						inputMode="numeric"
						pattern="[0-9]*"
						className="min-h-11 w-16 rounded-lg bg-slate-800 px-2"
						value={value}
						onChange={(e) => {
							setAskSwap(undefined);
							setValue(e.target.value);
						}}
					/>
				</label>
				<button
					type="submit"
					data-testid="page-number-save"
					disabled={busy}
					className={btn}
				>
					Set
				</button>
				<button
					type="button"
					data-testid="page-move-up"
					aria-label={`Move page ${pageNumber} earlier`}
					disabled={busy || isFirst}
					className={btn}
					onClick={() => void store().movePage(assetId, -1)}
				>
					↑
				</button>
				<button
					type="button"
					data-testid="page-move-down"
					aria-label={`Move page ${pageNumber} later`}
					disabled={busy || isLast}
					className={btn}
					onClick={() => void store().movePage(assetId, 1)}
				>
					↓
				</button>
			</form>
			{askSwap !== undefined && (
				<span
					role="alert"
					data-testid="page-swap-prompt"
					className="flex flex-wrap items-center gap-1 text-xs text-amber-200"
				>
					Page {askSwap} already has a scan.
					<button
						type="button"
						data-testid="page-swap-confirm"
						className={btn}
						onClick={() => void swap()}
					>
						Swap pages {pageNumber} and {askSwap}
					</button>
					<button
						type="button"
						className={btn}
						onClick={() => {
							setAskSwap(undefined);
							setValue(String(pageNumber));
						}}
					>
						Cancel
					</button>
				</span>
			)}
		</div>
	);
}
