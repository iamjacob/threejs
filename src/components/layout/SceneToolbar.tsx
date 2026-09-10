import { Eye, LampDesk } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { bookImagePath } from "../../lib/bookImages";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useSelectedBook } from "../../stores/useBookStore";
import { usePresentationStore } from "../../stores/usePresentationStore";
import BookBar from "./BookBar";

export default function SceneToolbar({
	showBlur,
	onChangeBook,
	vertical = false,
}: {
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
	const toggleClass =
		"flex h-11 w-10 shrink-0 touch-manipulation cursor-pointer items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white aria-pressed:bg-white/20 aria-pressed:text-white sm:w-11";

	return (
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
					src={publicAssetUrl(bookImagePath(book.cover.front, "low"))}
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

			{bookBarOpen && <BookBar id={bookBarId} onClose={closeBookBar} />}
		</fieldset>
	);
}
