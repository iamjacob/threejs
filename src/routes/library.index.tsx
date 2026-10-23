import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import AppShell from "../components/shell/AppShell";
import { useBookManagerStore } from "../stores/useBookManagerStore";

/**
 * "Your library": the active person's own library entries (SQLite), each linking to its stable
 * manager page /library/:libraryBookId. Works offline and without an account.
 */
export const Route = createFileRoute("/library/")({ component: LibraryPage });

const SOURCE: Record<string, string> = {
	catalog: "From the BOOOKS catalog",
	scan: "Scanned on this device",
	manual: "Added by hand",
};

function LibraryPage() {
	const status = useBookManagerStore((s) => s.status);
	const error = useBookManagerStore((s) => s.error);
	const profileId = useBookManagerStore((s) => s.profileId);
	const books = useBookManagerStore((s) => s.books);
	const loaded = useBookManagerStore((s) => s.booksLoaded);
	const busy = useBookManagerStore((s) => s.busy);
	const message = useBookManagerStore((s) => s.message);
	const navigate = useNavigate();
	const [title, setTitle] = useState("");
	const [author, setAuthor] = useState("");

	useEffect(() => {
		void useBookManagerStore.getState().boot();
	}, []);
	useEffect(() => {
		if (status === "ready" && profileId)
			void useBookManagerStore.getState().loadBooks();
	}, [status, profileId]);

	if (status === "locked")
		return (
			<AppShell title="Your library">
				<p data-testid="locked">
					Boooks is open in another tab. Close it to continue here.
				</p>
			</AppShell>
		);
	if (status === "error")
		return (
			<AppShell title="Your library">
				<p role="alert">Could not open local storage: {error}</p>
			</AppShell>
		);
	if (status !== "ready" || !profileId || !loaded)
		return (
			<AppShell title="Your library">
				<p data-testid="library-loading" aria-live="polite">
					Opening…
				</p>
			</AppShell>
		);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const book = await useBookManagerStore.getState().addBook(title, author);
		if (book) {
			setTitle("");
			setAuthor("");
			void navigate({ to: "/library/$bookId", params: { bookId: book.id } });
		}
	};

	return (
		<AppShell title="Your library">
			<p className="mb-4 text-sm text-slate-300">
				Books saved for the person using this device. Everything here is stored
				on this device.
			</p>
			{books.length === 0 ? (
				<p
					data-testid="library-empty"
					className="rounded-xl bg-white/5 p-4 text-sm text-slate-300"
				>
					No books yet. Add one below, or scan one from your shelves.
				</p>
			) : (
				<ul className="grid gap-2" data-testid="library-list">
					{books.map((b) => (
						<li key={b.id}>
							<Link
								to="/library/$bookId"
								params={{ bookId: b.id }}
								data-testid="library-book"
								className="flex min-h-14 flex-col justify-center rounded-xl bg-white/5 px-4 py-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
							>
								<span className="font-medium">{b.title}</span>
								<span className="text-xs text-slate-400">
									{[b.author, SOURCE[b.source] ?? b.source]
										.filter(Boolean)
										.join(" · ")}
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
			<form
				onSubmit={submit}
				className="mt-6 grid gap-2 rounded-xl border border-white/10 p-4"
				aria-labelledby="add-book"
			>
				<h2 id="add-book" className="font-medium">
					Add a book by hand
				</h2>
				<label className="grid gap-1 text-sm">
					Title
					<input
						data-testid="new-title"
						required
						maxLength={300}
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						className="min-h-11 rounded-lg bg-slate-800 px-3"
					/>
				</label>
				<label className="grid gap-1 text-sm">
					Author (optional)
					<input
						data-testid="new-author"
						maxLength={200}
						value={author}
						onChange={(e) => setAuthor(e.target.value)}
						className="min-h-11 rounded-lg bg-slate-800 px-3"
					/>
				</label>
				<button
					type="submit"
					data-testid="add-book"
					disabled={busy || !title.trim()}
					className="min-h-11 justify-self-start rounded-full bg-[#d91b24] px-5 font-medium text-white disabled:opacity-50"
				>
					Add book
				</button>
				{message && (
					<output role="alert" className="text-sm text-amber-300">
						{message}
					</output>
				)}
			</form>
		</AppShell>
	);
}
