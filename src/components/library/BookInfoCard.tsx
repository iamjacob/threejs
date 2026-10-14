import {
	ArrowLeft,
	BookOpen,
	BookOpenText,
	Check,
	LoaderCircle,
	SquarePen,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { bookImagePath } from "../../lib/bookImages";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useSelectedBook } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";
import { requestReaderFullscreen } from "../reader/readerFullscreen";
import "./book-info.css";

export default function BookInfoCard() {
	const book = useSelectedBook();
	const stage = useTourStore((state) => state.stage);
	const open = useTourStore((state) => state.openPreview);
	const read = useTourStore((state) => state.openReader);
	const back = useTourStore((state) => state.dismissPreview);
	const edit = useTourStore((state) => state.editPreview);
	const [more, setMore] = useState(false);
	const dragStartY = useRef<number | null>(null);
	const card = useRef<HTMLElement>(null);
	const detailsButton = useRef<HTMLButtonElement>(null);
	const details = useRef<HTMLDivElement>(null);
	const id = useId();
	const opening = stage === "pull";
	const opened = stage === "read";
	const readable = Boolean(book.epub || book.pdf);
	const author =
		(Array.isArray(book.author)
			? book.author.join(", ")
			: book.author
		).trim() || "Author not added";

	// biome-ignore lint/correctness/useExhaustiveDependencies: Focus the updated card when a different book is chosen, including via the keyboard picker.
	useEffect(() => {
		setMore(false);
		if (!document.activeElement?.closest("[data-book-navigation]"))
			card.current?.focus({ preventScroll: true });
	}, [book.id]);
	useEffect(() => {
		const keydown = (event: KeyboardEvent) => {
			if (
				event.key !== "Escape" ||
				event.defaultPrevented ||
				document.querySelector("dialog[open]")
			)
				return;
			event.preventDefault();
			if (more) {
				setMore(false);
				detailsButton.current?.focus();
			} else back();
		};
		const outside = (event: PointerEvent) => {
			if (
				event.target instanceof Node &&
				!details.current?.contains(event.target) &&
				!detailsButton.current?.contains(event.target)
			)
				setMore(false);
		};
		window.addEventListener("keydown", keydown);
		if (more) window.addEventListener("pointerdown", outside);
		return () => {
			window.removeEventListener("keydown", keydown);
			window.removeEventListener("pointerdown", outside);
		};
	}, [back, more]);

	return (
		<>
			<section
				ref={card}
				className="book-info"
				tabIndex={-1}
				aria-labelledby={`${id}-title`}
			>
				<div className="book-info-drag-handle" aria-hidden="true" />
				{more && (
					<div ref={details} id={`${id}-details`} className="book-info-details">
						<div className="book-info-metadata">
							<span>
								{book.id.startsWith("scan-")
									? "Scanned cover"
									: `${book.pages.toLocaleString()} pages`}
							</span>
							<span>
								{book.epub
									? "EPUB available"
									: book.pdf
										? "PDF available"
										: "No reading file"}
							</span>
						</div>
						<button
							type="button"
							onClick={() => {
								setMore(false);
								edit();
							}}
							disabled={opening}
						>
							<SquarePen size={17} aria-hidden="true" />
							<span>
								Edit on shelf<small>Arrange, drag, or stack this book</small>
							</span>
						</button>
					</div>
				)}
				<div
					className="book-info-summary"
					onPointerDown={(event) => {
						if (
							!(event.target instanceof Element) ||
							event.target.closest("button")
						)
							return;
						dragStartY.current = event.clientY;
					}}
					onPointerUp={(event) => {
						if (dragStartY.current === null) return;
						const distance = event.clientY - dragStartY.current;
						dragStartY.current = null;
						if (distance < -35) setMore(true);
						if (distance > 35) setMore(false);
					}}
					onPointerCancel={() => {
						dragStartY.current = null;
					}}
				>
					<img
						className="book-info-cover"
						src={publicAssetUrl(bookImagePath(book.cover.front, "low"))}
						alt=""
					/>
					<div className="book-info-heading">
						<h2 id={`${id}-title`}>{book.title}</h2>
						<p>{author}</p>
					</div>
					<button
						ref={detailsButton}
						type="button"
						className="book-info-more"
						aria-label="Open book details and options"
						aria-expanded={more}
						aria-controls={`${id}-details`}
						onClick={() => setMore(!more)}
					>
						Open
					</button>
				</div>
				{!readable && (
					<p id={`${id}-file-note`} className="sr-only">
						No EPUB or PDF attached to this book yet.
					</p>
				)}
			</section>
			<aside className="book-info-actions" aria-label="Book actions">
				<button
					type="button"
					onClick={open}
					disabled={opening || opened}
					title={opened ? "Book is open in 3D" : "Open the book in 3D"}
					aria-label={
						opening
							? "Opening book"
							: opened
								? "Book is open"
								: "Open book in 3D"
					}
					data-tooltip={opened ? "Opened" : "Open"}
				>
					{opening ? (
						<LoaderCircle
							className="book-info-spinner"
							size={17}
							aria-hidden="true"
						/>
					) : opened ? (
						<Check size={17} aria-hidden="true" />
					) : (
						<BookOpen size={17} aria-hidden="true" />
					)}
				</button>
				<button
					data-book-read
					type="button"
					className="book-info-read"
					aria-label="Read book"
					title={readable ? "Read book" : "No EPUB or PDF attached yet"}
					data-tooltip="Read"
					disabled={!readable || opening}
					aria-describedby={!readable ? `${id}-file-note` : undefined}
					onClick={() => {
						requestReaderFullscreen();
						read();
					}}
				>
					<BookOpenText size={17} aria-hidden="true" />
				</button>
				<button
					type="button"
					onClick={back}
					title={opened ? "Close book and return to shelf" : "Back to shelf"}
					data-tooltip="Back"
					aria-label={
						opened ? "Close book and return to shelf" : "Back to shelf"
					}
				>
					<ArrowLeft size={17} aria-hidden="true" />
				</button>
			</aside>
		</>
	);
}
