import { Eye, Info, LampDesk, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useSelectedBook } from "../../stores/useBookStore";
import { usePresentationStore } from "../../stores/usePresentationStore";
import BookBar from "./BookBar";
import { DEMO_SPECS, type SpecsId } from "./demoSpecs";

export default function SceneToolbar({
	activeId,
	showBlur,
	onChangeBook,
	vertical = false,
}: {
	activeId: SpecsId;
	showBlur: boolean;
	onChangeBook?: () => void;
	vertical?: boolean;
}) {
	const book = useSelectedBook();
	const [bookBarOpen, setBookBarOpen] = useState(false);
	const toolbarRef = useRef<HTMLFieldSetElement>(null);
	const bookButtonRef = useRef<HTMLButtonElement>(null);
	const bookBarId = useId();
	const closeBookBar = () => {
		setBookBarOpen(false);
		bookButtonRef.current?.focus();
	};
	useEffect(() => {
		if (!bookBarOpen) return;
		const closeOutside = (event: PointerEvent) => {
			if (!toolbarRef.current?.contains(event.target as Node))
				setBookBarOpen(false);
		};
		document.addEventListener("pointerdown", closeOutside);
		return () => document.removeEventListener("pointerdown", closeOutside);
	}, [bookBarOpen]);
	const lighting = usePresentationStore((state) => state.movingLight);
	const blur = usePresentationStore((state) => state.blurEnabled);
	const toggleLighting = usePresentationStore((state) => state.toggleLighting);
	const toggleBlur = usePresentationStore((state) => state.toggleBlur);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const descriptionId = useId();
	const spec = DEMO_SPECS[activeId];
	const toggleClass =
		"flex h-11 w-10 shrink-0 touch-manipulation cursor-pointer items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white aria-pressed:bg-white/20 aria-pressed:text-white sm:w-11";

	return (
		<>
			<fieldset
				ref={toolbarRef}
				className={`m-0 flex min-w-0 items-center border-0 p-0 sm:gap-1 ${vertical ? "flex-col" : ""}`}
				aria-label="Scene options"
			>
				<button
					ref={bookButtonRef}
					type="button"
					onClick={() =>
						onChangeBook ? onChangeBook() : setBookBarOpen((open) => !open)
					}
					aria-label={`Change book: ${book.title}`}
					aria-haspopup={onChangeBook ? undefined : "dialog"}
					aria-expanded={onChangeBook ? undefined : bookBarOpen}
					aria-controls={onChangeBook ? undefined : bookBarId}
					title={`Change book: ${book.title}`}
					className={toggleClass}
				>
					<img
						src={publicAssetUrl(book.cover.front)}
						alt=""
						className="h-7 w-5 rounded-sm object-cover"
					/>
				</button>
				<button
					type="button"
					aria-label="Moving spotlight"
					title={
						lighting ? "Turn off moving spotlight" : "Turn on moving spotlight"
					}
					aria-pressed={lighting}
					onClick={toggleLighting}
					className={toggleClass}
				>
					<LampDesk size={20} strokeWidth={1.6} aria-hidden="true" />
				</button>
				{showBlur && (
					<button
						type="button"
						aria-label="Blur book"
						title={blur ? "Reveal book" : "Blur book"}
						aria-pressed={blur}
						onClick={toggleBlur}
						className={toggleClass}
					>
						<Eye size={20} strokeWidth={1.6} aria-hidden="true" />
					</button>
				)}
				<button
					type="button"
					aria-label="Element specs"
					title="Element specs"
					aria-haspopup="dialog"
					onClick={() => {
						setBookBarOpen(false);
						dialogRef.current?.showModal();
					}}
					className={toggleClass}
				>
					<Info size={20} strokeWidth={1.6} aria-hidden="true" />
				</button>
				{bookBarOpen && <BookBar id={bookBarId} onClose={closeBookBar} />}
			</fieldset>
			<dialog
				ref={dialogRef}
				closedby="any"
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#111b32]/95 p-5 text-white shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
			>
				<div className="mb-3 flex items-start justify-between gap-3">
					<div>
						<p className="mb-1 text-sm font-medium text-cyan-200/90">
							Element specs
						</p>
						<h2 id={titleId} className="text-2xl font-medium">
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
				<p
					id={descriptionId}
					className="text-base leading-relaxed text-white/80"
				>
					{spec.description}
				</p>
				<h3 className="mt-5 text-base font-medium text-cyan-200">Built with</h3>
				<dl className="mb-4 divide-y divide-white/10 text-base leading-relaxed">
					{[
						...spec.values,
						["Example book", book.title],
						[
							"Book size",
							`${book.dimensions.map((value) => (value * 30).toFixed(1)).join(" × ")} cm · width × height × thickness`,
						],
						[
							"Lighting",
							lighting ? "Soft studio + moving white spotlight" : "Soft studio",
						],
					].map(([label, value]) => (
						<div
							key={label}
							className="grid grid-cols-1 gap-1 py-3 min-[400px]:grid-cols-[7rem_1fr] min-[400px]:gap-3"
						>
							<dt className="text-white/75">{label}</dt>
							<dd className="text-white/90">{value}</dd>
						</div>
					))}
				</dl>
				<div className="mb-4 rounded-xl border border-white/10 p-3 text-base leading-relaxed">
					<h3 className="mb-1 font-medium text-cyan-200">Needs</h3>
					<p className="text-white/80">{spec.needs}</p>
				</div>
				<h3 className="text-base font-medium text-cyan-200">To enhance next</h3>
				<ul className="mt-2 mb-4 list-disc space-y-2 pl-4 text-base leading-relaxed text-white/80">
					{spec.enhancements.map((enhancement) => (
						<li key={enhancement}>{enhancement}</li>
					))}
				</ul>
				<p className="rounded-xl bg-white/5 p-3 text-base leading-relaxed text-cyan-100/80">
					{spec.hint}
				</p>
			</dialog>
		</>
	);
}
