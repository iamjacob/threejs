import { useEffect, useRef, useState } from "react";
import type { BookOverview } from "../../data/usecases/bookManager";
import { useBookManagerStore } from "../../stores/useBookManagerStore";

/**
 * Full-size view of one page scan from this profile's local storage, with previous/next in reading
 * order. A native <dialog> (focus trap, Esc to close). Bytes are read via the profile-scoped use
 * case; the object URL is revoked when the page changes or the viewer closes.
 */
export default function PageViewer({
	pages,
	index,
	onIndex,
	onClose,
}: {
	pages: BookOverview["pages"];
	index: number;
	onIndex: (i: number) => void;
	onClose: () => void;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	const [src, setSrc] = useState<string>();
	const [failed, setFailed] = useState(false);
	const page = pages[index];
	useEffect(() => {
		ref.current?.showModal();
	}, []);
	useEffect(() => {
		setSrc(undefined);
		setFailed(false);
		if (!page?.fileId) return setFailed(true);
		let url: string | undefined;
		let live = true;
		void useBookManagerStore
			.getState()
			.previewUrl(page.fileId)
			.then((u) => {
				url = u;
				if (!live) {
					if (u) URL.revokeObjectURL(u);
					return;
				}
				if (u) setSrc(u);
				else setFailed(true);
			});
		return () => {
			live = false;
			if (url) URL.revokeObjectURL(url);
		};
	}, [page?.fileId]);
	if (!page) return null;
	const n = (page.pageIndex ?? 0) + 1;
	const nav =
		"min-h-11 rounded-full bg-white/10 px-4 text-sm disabled:opacity-40";
	return (
		<dialog
			ref={ref}
			data-testid="page-viewer"
			aria-label={`Page ${n}`}
			onClose={onClose}
			className="m-0 h-full max-h-none w-full max-w-none bg-black/95 p-0 text-white backdrop:bg-black/80"
		>
			<div className="grid h-full grid-rows-[auto_1fr_auto] gap-2 p-3">
				<div className="flex items-center justify-between">
					<span data-testid="viewer-page-number" className="font-medium">
						Page {n}
						<span className="text-slate-400">
							{" "}
							· {index + 1} of {pages.length}
						</span>
					</span>
					<button
						type="button"
						data-testid="viewer-close"
						className={nav}
						onClick={() => ref.current?.close()}
					>
						Close
					</button>
				</div>
				<div className="grid min-h-0 place-items-center overflow-auto">
					{src ? (
						<img
							src={src}
							alt={`Page ${n}, full size`}
							data-testid="viewer-image"
							className="max-h-full max-w-full object-contain"
						/>
					) : failed ? (
						<p role="alert" className="text-amber-300">
							This page&apos;s image is missing on this device.
						</p>
					) : (
						<p aria-live="polite">Opening…</p>
					)}
				</div>
				<div className="flex justify-center gap-2">
					<button
						type="button"
						data-testid="viewer-prev"
						className={nav}
						disabled={index === 0}
						onClick={() => onIndex(index - 1)}
					>
						Previous
					</button>
					<button
						type="button"
						data-testid="viewer-next"
						className={nav}
						disabled={index === pages.length - 1}
						onClick={() => onIndex(index + 1)}
					>
						Next
					</button>
				</div>
			</div>
		</dialog>
	);
}
