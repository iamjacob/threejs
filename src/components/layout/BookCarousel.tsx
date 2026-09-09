import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { books } from "../../lib/bookCatalog";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useBookStore, useSelectedBook } from "../../stores/useBookStore";

const wrapIndex = (index: number) => (index + books.length) % books.length;

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
	const stageRef = useRef<HTMLFieldSetElement>(null);
	const pointer = useRef<{ x: number; moved: boolean } | null>(null);
	const headingId = useId();
	const descriptionId = useId();
	const book = books[activeIndex];
	const move = (step: number) =>
		setActiveIndex((index) => wrapIndex(index + step));

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (!isOpen) {
			dialog.close();
			return;
		}
		setActiveIndex(books.indexOf(selectedBook));
		if (!dialog.open) dialog.showModal();
	}, [isOpen, selectedBook]);

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
				<p className="book-picker-eyebrow">Boooks · Pick your companion</p>
				<h1 id={headingId}>CHOOSE YOUR BOOK</h1>
				<p id={descriptionId}>One book. Every experiment. Make it yours.</p>
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
				ref={stageRef}
				className="book-carousel-stage"
				aria-roledescription="carousel"
				aria-label="Choose your example book"
				onKeyDown={(event) => {
					if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
						return;
					event.preventDefault();
					const index =
						event.key === "Home"
							? 0
							: event.key === "End"
								? books.length - 1
								: wrapIndex(
										activeIndex + (event.key === "ArrowRight" ? 1 : -1),
									);
					setActiveIndex(index);
					stageRef.current
						?.querySelectorAll<HTMLButtonElement>(".book-carousel-slide")
						[index]?.focus({ preventScroll: true });
				}}
				onPointerDown={(event) => {
					pointer.current = { x: event.clientX, moved: false };
				}}
				onPointerMove={(event) => {
					if (
						pointer.current &&
						Math.abs(event.clientX - pointer.current.x) > 15
					) {
						pointer.current.moved = true;
						event.currentTarget.setPointerCapture(event.pointerId);
					}
				}}
				onPointerUp={(event) => {
					if (pointer.current?.moved) {
						const delta = pointer.current.x - event.clientX;
						move(
							Math.max(
								-4,
								Math.min(4, Math.round(delta / 80) || Math.sign(delta)),
							),
						);
					}
				}}
				onPointerCancel={() => {
					pointer.current = null;
				}}
			>
				<div className="book-orbit-guide" aria-hidden="true" />
				{books.map((item, index) => {
					const angle = ((index - activeIndex) * Math.PI * 2) / books.length;
					const depth = (Math.cos(angle) + 1) / 2;
					const scale = 0.28 + 0.72 * depth;
					return (
						<button
							type="button"
							key={item.id}
							className="book-carousel-slide"
							aria-label={`${item.title} by ${item.author}`}
							aria-pressed={index === activeIndex}
							tabIndex={index === activeIndex ? 0 : -1}
							style={{
								transform: `translate(-50%, -50%) translateX(calc(var(--orbit-radius) * ${Math.sin(angle)})) translateY(${(1 - depth) * -150}px) scale(${scale}) rotateY(${-Math.sin(angle) * 50}deg) rotateZ(${Math.sin(angle) * 6}deg)`,
								zIndex: Math.round(depth * 100),
								opacity: 0.12 + 0.88 * depth ** 3,
							}}
							onClick={() => {
								if (!pointer.current?.moved) setActiveIndex(index);
							}}
						>
							<img
								src={publicAssetUrl(item.cover.front)}
								alt={item.title}
								draggable={false}
								loading="eager"
								decoding="async"
							/>
						</button>
					);
				})}
			</fieldset>
			<div className="book-carousel-navigation">
				<button
					type="button"
					aria-label="Previous book"
					onClick={() => move(-1)}
				>
					<ArrowLeft size={20} />
				</button>
				<span>
					{String(activeIndex + 1).padStart(2, "0")}{" "}
					<span className="text-white/30">/ {books.length}</span>
				</span>
				<button type="button" aria-label="Next book" onClick={() => move(1)}>
					<ArrowRight size={20} />
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
			<p className="book-picker-footnote">
				Drag or swipe to browse · Change your book anytime
			</p>
		</dialog>
	);
}
