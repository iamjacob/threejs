import {
	ArrowLeft,
	BookOpen,
	BookOpenText,
	Check,
	LoaderCircle,
	PanelTopClose,
	PanelTopOpen,
	SquarePen,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { bookImagePath } from "../../lib/bookImages";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useSelectedBook } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";
import BookPageSwiper from "../openbook/BookPageSwiper";
import BookmarkRibbon from "../reader/BookmarkRibbon";
import BookSizeAdjuster from "./BookSizeAdjuster";

import "./book-info.css";

export default function BookInfoCard() {
	const book = useSelectedBook();
	const stage = useTourStore((state) => state.stage);
	const reader = useTourStore((state) => state.reader);
	const open = useTourStore((state) => state.openPreview);
	const read = useTourStore((state) => state.openReader);
	const back = useTourStore((state) => state.dismissPreview);
	const edit = useTourStore((state) => state.editPreview);
	const [more, setMore] = useState(false);
	const dragStart = useRef<{ y: number; pointerId: number } | null>(null);
	const suppressHandleClick = useRef(false);
	const [pullOffset, setPullOffset] = useState(0);
	const card = useRef<HTMLElement>(null);
	const detailsButton = useRef<HTMLButtonElement>(null);
	const details = useRef<HTMLDivElement>(null);
	const id = useId();
	const opening = stage === "pull";
	const opened = stage === "read";
	const readable = Boolean(book.epub || book.pdf || book.scanPages?.length);
	const author =
		(Array.isArray(book.author)
			? book.author.join(", ")
			: book.author
		).trim() || "Author not added";

	// biome-ignore lint/correctness/useExhaustiveDependencies: Focus the updated card when a different book is chosen, including via the keyboard picker.
	useEffect(() => {
		setMore(false);
		if (!document.activeElement?.closest("[data-book-navigation]"))
			detailsButton.current?.focus({ preventScroll: true });
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
				!card.current?.contains(event.target) &&
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
				className={`book-info${more ? "" : " book-info-collapsed"}`}
				tabIndex={-1}
				aria-label="Book information"
			>
				<div id={`${id}-details`} ref={details} hidden={!more}>
					<div className="book-info-summary">
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
							type="button"
							className="book-info-more"
							aria-label={opened ? "Book is open" : "Open book in 3D"}
							disabled={opening || opened}
							onClick={open}
						>
							{opening ? (
								<LoaderCircle
									size={16}
									className="book-info-spinner"
									aria-hidden="true"
								/>
							) : opened ? (
								<Check size={16} aria-hidden="true" />
							) : (
								<BookOpen size={16} aria-hidden="true" />
							)}
							{opening ? "Opening" : opened ? "Opened" : "Open"}
						</button>
					</div>
					{more && (
						<div className="book-info-details">
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
							<BookSizeAdjuster book={book} />
						</div>
					)}
				</div>
				<button
					ref={detailsButton}
					type="button"
					className="book-info-drag-handle"
					aria-label={
						more
							? "Hide book details; drag up to close"
							: "More book information; drag down to expand"
					}
					aria-expanded={more}
					aria-controls={`${id}-details`}
					style={{ transform: `translateY(${pullOffset}px)` }}
					onPointerDown={(event) => {
						if (!event.isPrimary || event.button !== 0) return;
						dragStart.current = {
							y: event.clientY,
							pointerId: event.pointerId,
						};
						suppressHandleClick.current = false;
						event.currentTarget.setPointerCapture(event.pointerId);
					}}
					onPointerMove={(event) => {
						if (dragStart.current?.pointerId !== event.pointerId) return;
						const distance = event.clientY - dragStart.current.y;
						if (Math.abs(distance) > 8) suppressHandleClick.current = true;
						setPullOffset(Math.max(-12, Math.min(18, distance * 0.25)));
					}}
					onPointerUp={(event) => {
						if (dragStart.current?.pointerId !== event.pointerId) return;
						const distance = event.clientY - dragStart.current.y;
						if (distance > 30) setMore(true);
						else if (distance < -30) setMore(false);
						if (Math.abs(distance) > 8) suppressHandleClick.current = true;
						dragStart.current = null;
						setPullOffset(0);
						event.currentTarget.releasePointerCapture(event.pointerId);
					}}
					onPointerCancel={() => {
						dragStart.current = null;
						setPullOffset(0);
						suppressHandleClick.current = true;
					}}
					onLostPointerCapture={() => {
						dragStart.current = null;
						setPullOffset(0);
					}}
					onClick={(event) => {
						if (event.detail !== 0 && suppressHandleClick.current) {
							suppressHandleClick.current = false;
							return;
						}
						setMore((value) => !value);
					}}
				>
					{more ? (
						<PanelTopClose size={20} aria-hidden="true" />
					) : (
						<PanelTopOpen size={20} aria-hidden="true" />
					)}
				</button>
				{!readable && (
					<p id={`${id}-file-note`} className="sr-only">
						No EPUB or PDF attached to this book yet.
					</p>
				)}
			</section>
			<aside className="book-info-actions" aria-label="Book actions">
				{opened && <BookmarkRibbon embedded />}
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
					data-tooltip={opened ? "Read in Foliate" : "Open to read"}
					disabled={!readable || opening}
					aria-describedby={!readable ? `${id}-file-note` : undefined}
					onClick={() => {
						// Open in 3D first; the next click takes us into Foliate.
						read();
					}}
				>
					<BookOpenText size={17} aria-hidden="true" />
				</button>
				{opened && reader === "closed" && (
					<BookPageSwiper
						key={book.id}
						embedded
						onInteract={() => useTourStore.setState({ paused: true })}
					/>
				)}
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
