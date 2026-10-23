import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import ContentPanel from "../components/bookManager/ContentPanel";
import MetadataForm from "../components/bookManager/MetadataForm";
import StatusPanel from "../components/bookManager/StatusPanel";
import StorageCleanup from "../components/bookManager/StorageCleanup";
import AppShell from "../components/shell/AppShell";
import { useBookManagerStore } from "../stores/useBookManagerStore";

/**
 * Book Overview / Data Manager for one library entry. `$bookId` is the stable library book id
 * (SQLite `library_books.id`) of the ACTIVE profile; another person's id shows "not found".
 */
export const Route = createFileRoute("/library/$bookId")({
	component: BookManagerPage,
});

const SOURCE: Record<string, string> = {
	catalog: "BOOOKS catalog",
	scan: "Shelf scanner on this device",
	manual: "Added by hand",
};

function BookManagerPage() {
	const { bookId } = Route.useParams();
	const status = useBookManagerStore((s) => s.status);
	const error = useBookManagerStore((s) => s.error);
	const profileId = useBookManagerStore((s) => s.profileId);
	const overview = useBookManagerStore((s) => s.overview);
	const overviewFor = useBookManagerStore((s) => s.overviewFor);
	const missing = useBookManagerStore((s) => s.missing);
	const message = useBookManagerStore((s) => s.message);

	useEffect(() => {
		void useBookManagerStore.getState().boot();
	}, []);
	useEffect(() => {
		if (status === "ready" && profileId)
			void useBookManagerStore.getState().open(bookId);
	}, [status, profileId, bookId]);

	const shell = (children: React.ReactNode, title = "Book") => (
		<AppShell title={title} wide>
			<Link
				to="/library"
				className="mb-4 inline-flex min-h-11 items-center text-sm text-sky-300 underline"
			>
				← Your library
			</Link>
			{children}
		</AppShell>
	);
	if (status === "locked")
		return shell(
			<p data-testid="locked">
				Boooks is open in another tab. Close it to continue here.
			</p>,
		);
	if (status === "error")
		return shell(<p role="alert">Could not open local storage: {error}</p>);
	if (missing === bookId)
		return shell(
			<p
				data-testid="manager-not-found"
				role="alert"
				className="text-slate-300"
			>
				This book is not in the library of the person using this device right
				now.
			</p>,
			"Book not found",
		);
	if (
		status !== "ready" ||
		!profileId ||
		!overview ||
		overviewFor !== bookId ||
		overview.book.id !== bookId
	)
		return shell(
			<p data-testid="manager-loading" aria-live="polite">
				Opening…
			</p>,
		);

	const { book } = overview;
	return shell(
		<div className="grid gap-8" data-testid="book-manager">
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				<dt className="text-slate-400">Author</dt>
				<dd data-testid="manager-author">{book.author || "Not added"}</dd>
				<dt className="text-slate-400">Source</dt>
				<dd>{SOURCE[book.source] ?? book.source}</dd>
				<dt className="text-slate-400">Library ID</dt>
				<dd className="break-all font-mono text-xs" data-testid="manager-id">
					{book.id}
				</dd>
				{book.catalogId && (
					<>
						<dt className="text-slate-400">Catalog ID</dt>
						<dd className="font-mono text-xs">{book.catalogId}</dd>
					</>
				)}
			</dl>
			{message && (
				<output
					role="alert"
					data-testid="manager-message"
					className="text-sm text-amber-300"
				>
					{message}
				</output>
			)}
			<StatusPanel status={overview.status} />
			<ContentPanel overview={overview} />
			<MetadataForm key={book.id} book={book} />
			<StorageCleanup />
		</div>,
		book.title,
	);
}
