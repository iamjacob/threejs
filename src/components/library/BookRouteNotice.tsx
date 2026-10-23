import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { BookRouteProblem } from "./useBookRouteSync";

const TEXT: Record<BookRouteProblem["kind"], { title: string; body: string }> =
	{
		missing: {
			title: "Book not found",
			body: "This book is not on the shelves for whoever is using this device right now. The link may be wrong, the book may have been removed, or it may belong to someone else on this device.",
		},
		unreadable: {
			title: "Nothing to read yet",
			body: "This book has no EPUB, PDF or scanned pages on this device, so it cannot open in the reader. Its details are shown instead.",
		},
		locked: {
			title: "Boooks is open in another tab",
			body: "Close the other tab to open books scanned on this device. Public catalog books still open here.",
		},
	};

/**
 * Real not-found / not-readable state for /book/:id and /read/:id, shown over the shelves so the
 * scene stays visible. Focus moves here so screen readers announce it.
 */
export default function BookRouteNotice({
	problem,
	onDismiss,
}: {
	problem: BookRouteProblem;
	onDismiss: () => void;
}) {
	const heading = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		heading.current?.focus({ preventScroll: true });
	}, []);
	const { title, body } = TEXT[problem.kind];
	const action =
		"inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
	return (
		<section
			role="alert"
			aria-labelledby="book-route-notice-title"
			data-testid={`book-route-${problem.kind}`}
			className="fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[1700] mx-auto grid max-w-md gap-3 rounded-2xl border border-white/15 bg-[#0b1022]/95 p-5 text-stone-100 shadow-2xl backdrop-blur"
		>
			<h2
				id="book-route-notice-title"
				ref={heading}
				tabIndex={-1}
				className="text-lg font-semibold outline-none"
			>
				{title}
			</h2>
			<p className="text-sm leading-relaxed text-stone-300">{body}</p>
			<div className="flex flex-wrap gap-2">
				{problem.kind === "unreadable" ? (
					<button
						type="button"
						onClick={onDismiss}
						className={`${action} bg-[#d91b24] text-white`}
					>
						Show book details
					</button>
				) : (
					<Link
						to="/"
						replace
						onClick={onDismiss}
						className={`${action} bg-[#d91b24] text-white`}
					>
						Go to your Library
					</Link>
				)}
				<Link to="/more" className={`${action} bg-white/10`}>
					All pages
				</Link>
			</div>
		</section>
	);
}
