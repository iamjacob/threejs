import { Eye, Info, Sparkles, X } from "lucide-react";
import { useId, useRef } from "react";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useSelectedBook } from "../../stores/useBookStore";
import { usePresentationStore } from "../../stores/usePresentationStore";
import { DEMO_SPECS, type SpecsId } from "./demoSpecs";

export default function SceneToolbar({
	activeId,
	showBlur,
	onChangeBook,
}: {
	activeId: SpecsId;
	showBlur: boolean;
	onChangeBook: () => void;
}) {
	const book = useSelectedBook();
	const lighting = usePresentationStore((state) => state.redAccent);
	const blur = usePresentationStore((state) => state.blurEnabled);
	const toggleLighting = usePresentationStore((state) => state.toggleLighting);
	const toggleBlur = usePresentationStore((state) => state.toggleBlur);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const descriptionId = useId();
	const spec = DEMO_SPECS[activeId];
	const toggleClass =
		"flex min-h-11 touch-manipulation cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-black/20 px-2 text-xs font-medium text-white/75 backdrop-blur-xl transition-colors hover:bg-white/10 aria-pressed:border-cyan-200/30 aria-pressed:bg-cyan-300/15 aria-pressed:text-cyan-100";

	return (
		<>
			<fieldset
				className="absolute top-16 left-4 z-20 m-0 flex flex-wrap min-w-0 max-w-[calc(100%-2rem)] items-center gap-2 border-0 p-0"
				aria-label="Scene options"
			>
				<button
					type="button"
					onClick={onChangeBook}
					aria-label={`Change book: ${book.title}`}
					aria-haspopup="dialog"
					title={book.title}
					className={toggleClass}
				>
					<img
						src={publicAssetUrl(book.cover.front)}
						alt=""
						className="h-7 w-5 rounded-sm object-cover"
					/>
					<span className="hidden min-[420px]:inline">Change book</span>
				</button>
				<button
					type="button"
					aria-label="Red accent light"
					title="Add a red accent; soft studio lighting stays on"
					aria-pressed={lighting}
					onClick={toggleLighting}
					className={toggleClass}
				>
					<Sparkles size={16} aria-hidden="true" />
					Red light
					<span className="text-[10px] opacity-60">
						{lighting ? "On" : "Off"}
					</span>
				</button>
				{showBlur && (
					<button
						type="button"
						aria-label="Blur book"
						aria-pressed={blur}
						onClick={toggleBlur}
						className={toggleClass}
					>
						<Eye size={16} aria-hidden="true" />
						Blur
						<span className="text-[10px] opacity-60">
							{blur ? "On" : "Off"}
						</span>
					</button>
				)}
				<button
					type="button"
					aria-label="Element specs"
					aria-haspopup="dialog"
					onClick={() => dialogRef.current?.showModal()}
					className={toggleClass}
				>
					<Info size={16} aria-hidden="true" />
					Specs
				</button>
			</fieldset>
			<dialog
				ref={dialogRef}
				closedby="any"
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-white/15 bg-[#111b32]/95 p-5 text-white shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
			>
				<div className="mb-3 flex items-start justify-between gap-3">
					<div>
						<p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">
							Element specs
						</p>
						<h2 id={titleId} className="text-lg font-medium">
							{spec.title}
						</h2>
					</div>
					<button
						type="button"
						aria-label="Close element specs"
						onClick={() => dialogRef.current?.close()}
						className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
					>
						<X size={18} aria-hidden="true" />
					</button>
				</div>
				<p id={descriptionId} className="text-sm leading-relaxed text-white/70">
					{spec.description}
				</p>
				<h3 className="mt-5 text-xs font-medium text-cyan-200">Built with</h3>
				<dl className="mb-4 divide-y divide-white/10 text-xs leading-relaxed">
					{[
						...spec.values,
						["Example book", book.title],
						[
							"Book size",
							`${book.dimensions.map((value) => (value * 30).toFixed(1)).join(" × ")} cm · width × height × thickness`,
						],
						[
							"Lighting",
							lighting ? "Soft studio + red accent" : "Soft studio · always on",
						],
					].map(([label, value]) => (
						<div key={label} className="grid grid-cols-[6rem_1fr] gap-3 py-3">
							<dt className="text-white/45">{label}</dt>
							<dd className="text-white/90">{value}</dd>
						</div>
					))}
				</dl>
				<div className="mb-4 rounded-xl border border-white/10 p-3 text-xs leading-relaxed">
					<h3 className="mb-1 font-medium text-cyan-200">Needs</h3>
					<p className="text-white/70">{spec.needs}</p>
				</div>
				<h3 className="text-xs font-medium text-cyan-200">To enhance next</h3>
				<ul className="mt-2 mb-4 list-disc space-y-2 pl-4 text-xs leading-relaxed text-white/70">
					{spec.enhancements.map((enhancement) => (
						<li key={enhancement}>{enhancement}</li>
					))}
				</ul>
				<p className="rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-cyan-100/80">
					{spec.hint}
				</p>
			</dialog>
		</>
	);
}
