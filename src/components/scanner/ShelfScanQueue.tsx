import { Check, ChevronRight, Library, LoaderCircle, X } from "lucide-react";
import type { ShelfBook } from "./scanMetadata";
import "./shelf-scan-queue.css";

/**
 * Walks a shelf scan one book at a time. The AI returns the whole array, but
 * we only ever surface the current book: accept it (becomes a new draft),
 * skip it, or stop.
 */
export default function ShelfScanQueue({
	image,
	books,
	index,
	loading,
	error,
	onAccept,
	onSkip,
	onClose,
}: {
	image: string;
	books: ShelfBook[];
	index: number;
	loading: boolean;
	error?: string;
	onAccept: (book: ShelfBook) => void;
	onSkip: () => void;
	onClose: () => void;
}) {
	const current = books[index];
	const done = !loading && !error && index >= books.length;
	return (
		<section className="ssq" aria-label="Books found on the shelf">
			<header>
				<Library size={15} aria-hidden="true" />
				<span>
					Shelf scan
					<small>
						{loading
							? "Reading the shelf…"
							: error
								? error
								: done
									? `All ${books.length} books handled`
									: `Book ${index + 1} of ${books.length}`}
					</small>
				</span>
				<button type="button" aria-label="Close shelf scan" onClick={onClose}>
					<X size={16} />
				</button>
			</header>
			<div className="ssq-photo">
				<img src={image} alt="The shelf you photographed" />
				{current?.box && (
					<span
						className="ssq-box"
						style={{
							left: `${current.box.x * 100}%`,
							top: `${current.box.y * 100}%`,
							width: `${current.box.width * 100}%`,
							height: `${current.box.height * 100}%`,
						}}
					/>
				)}
				{books.length > 0 && (
					<ol className="ssq-dots" aria-label="Progress">
						{books.map((book, i) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: the shelf position is the identity of a dot.
								key={`${i}-${book.title}`}
								className={i < index ? "done" : i === index ? "cur" : ""}
							/>
						))}
					</ol>
				)}
			</div>
			{loading && (
				<p className="ssq-status">
					<LoaderCircle size={14} className="scan-spin" aria-hidden="true" />
					The AI is listing the books. This can take a few seconds.
				</p>
			)}
			{!loading && !error && books.length === 0 && (
				<p className="ssq-status">
					No readable spines found. Try closer, with more light.
				</p>
			)}
			{current && (
				<div className="ssq-card">
					<span className="k">Found</span>
					<strong>{current.title || "Untitled"}</strong>
					{current.subtitle && <em>{current.subtitle}</em>}
					<span className="a">{current.author || "Author unreadable"}</span>
					<div className="ssq-actions">
						<button type="button" className="skip" onClick={onSkip}>
							Skip
						</button>
						<button
							type="button"
							className="accept"
							onClick={() => onAccept(current)}
						>
							<Check size={15} aria-hidden="true" /> Add this book
							<ChevronRight size={15} aria-hidden="true" />
						</button>
					</div>
				</div>
			)}
			{done && books.length > 0 && (
				<button type="button" className="ssq-finish" onClick={onClose}>
					Done
				</button>
			)}
		</section>
	);
}
