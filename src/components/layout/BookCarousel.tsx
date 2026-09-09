import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { books } from "../../lib/bookCatalog";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useBookStore, useSelectedBook } from "../../stores/useBookStore";

export default function BookCarousel({
	isOpen,
	firstChoice,
	onClose,
	onChoose,
}: {
	isOpen: boolean;
	firstChoice: boolean;
	onClose: () => void;
	onChoose: () => void;
}) {
	const selectedBook = useSelectedBook();
	const selectBook = useBookStore((state) => state.selectBook);
	const [activeIndex, setActiveIndex] = useState(() =>
		books.indexOf(selectedBook),
	);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const trackRef = useRef<HTMLFieldSetElement>(null);
	const headingId = useId();
	const descriptionId = useId();
	const book = books[activeIndex];

	const scrollToBook = useCallback(
		(index: number, behavior: ScrollBehavior = "smooth") => {
			const track = trackRef.current;
			const slide = track?.children[index] as HTMLElement | undefined;
			if (!track || !slide) return;
			track.scrollTo({
				left: slide.offsetLeft + slide.offsetWidth / 2 - track.clientWidth / 2,
				behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
					? "instant"
					: behavior,
			});
		},
		[],
	);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (!isOpen) {
			dialog.close();
			return;
		}
		if (!dialog.open) dialog.showModal();
		const index = books.indexOf(selectedBook);
		setActiveIndex(index);
		const frame = requestAnimationFrame(() => scrollToBook(index, "instant"));
		return () => cancelAnimationFrame(frame);
	}, [isOpen, selectedBook, scrollToBook]);

	return (
		<dialog
			ref={dialogRef}
			className="book-picker"
			aria-labelledby={headingId}
			aria-describedby={descriptionId}
			onClose={onClose}
			onCancel={(event) => {
				if (firstChoice) event.preventDefault();
			}}
		>
			<div className="book-picker-heading">
				<p className="book-picker-eyebrow">A little Boooks adventure</p>
				<h1 id={headingId}>
					{firstChoice
						? "Every book has a story."
						: "A different book. A new perspective."}
				</h1>
				<p id={descriptionId}>
					Choose yours. Take it through every experiment.
				</p>
			</div>
			{!firstChoice && (
				<button
					type="button"
					className="book-picker-close"
					aria-label="Close book chooser"
					onClick={onClose}
				>
					<X size={20} />
				</button>
			)}
			<fieldset
				ref={trackRef}
				className="book-carousel-track"
				aria-roledescription="carousel"
				aria-label="Choose your example book"
				onScroll={() => {
					const track = trackRef.current;
					if (!track) return;
					const center = track.scrollLeft + track.clientWidth / 2;
					let nearest = 0;
					let distance = Number.POSITIVE_INFINITY;
					Array.from(track.children).forEach((slide, index) => {
						const element = slide as HTMLElement;
						const delta = Math.abs(
							element.offsetLeft + element.offsetWidth / 2 - center,
						);
						if (delta < distance) {
							nearest = index;
							distance = delta;
						}
					});
					setActiveIndex(nearest);
				}}
				onKeyDown={(event) => {
					if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
						return;
					event.preventDefault();
					const index =
						event.key === "Home"
							? 0
							: event.key === "End"
								? books.length - 1
								: Math.max(
										0,
										Math.min(
											books.length - 1,
											activeIndex + (event.key === "ArrowRight" ? 1 : -1),
										),
									);
					scrollToBook(index);
					(trackRef.current?.children[index] as HTMLElement)?.focus({
						preventScroll: true,
					});
				}}
			>
				{books.map((item, index) => (
					<button
						type="button"
						key={item.id}
						className="book-carousel-slide"
						aria-label={`${item.title} by ${item.author}`}
						aria-pressed={index === activeIndex}
						tabIndex={index === activeIndex ? 0 : -1}
						onClick={() => scrollToBook(index)}
					>
						<img
							src={publicAssetUrl(item.cover.front)}
							alt={item.title}
							draggable={false}
							loading={Math.abs(index - activeIndex) < 3 ? "eager" : "lazy"}
							decoding="async"
						/>
						<span className="book-carousel-marker" aria-hidden="true">
							<Check size={14} />
						</span>
					</button>
				))}
			</fieldset>
			<div className="book-carousel-navigation">
				<button
					type="button"
					aria-label="Previous book"
					disabled={activeIndex === 0}
					onClick={() => scrollToBook(activeIndex - 1)}
				>
					<ArrowLeft size={19} />
				</button>
				<span>
					{String(activeIndex + 1).padStart(2, "0")}{" "}
					<span className="text-white/30">/ {books.length}</span>
				</span>
				<button
					type="button"
					aria-label="Next book"
					disabled={activeIndex === books.length - 1}
					onClick={() => scrollToBook(activeIndex + 1)}
				>
					<ArrowRight size={19} />
				</button>
			</div>
			<div
				className="book-picker-details"
				aria-live="polite"
				aria-atomic="true"
			>
				<h2>{book.title}</h2>
				<p>{book.author}</p>
			</div>
			<button
				type="button"
				className="book-picker-confirm"
				onClick={() => {
					selectBook(book.id);
					onChoose();
				}}
			>
				{firstChoice ? "Explore with this book" : "Use this book"}
				<ArrowRight size={18} />
			</button>
			<p className="book-picker-footnote">You can change your book anytime.</p>
		</dialog>
	);
}
