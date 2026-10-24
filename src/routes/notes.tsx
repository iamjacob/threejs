import { createFileRoute, Link } from "@tanstack/react-router";
import {
	type FormEvent,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useState,
} from "react";
import { AccountPanel, NoteItem } from "../components/notes/NoteItem";
import { useNotesStore } from "../stores/useNotesStore";

/**
 * Minimal offline CRUD slice: SQLite → repository/use case → Zustand → this UI.
 * Deliberately plain and separate from the 3D scene (no Three.js is loaded on this route).
 */
export const Route = createFileRoute("/notes")({ component: NotesPage });

function NotesPage() {
	const store = useNotesStore();
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");

	useLayoutEffect(() => {
		document.getElementById("boot")?.remove();
	}, []);
	useEffect(() => {
		void useNotesStore.getState().boot();
	}, []);

	if (store.status === "locked")
		return (
			<Shell>
				<p data-testid="locked">
					Boooks is open in another tab. Close it to edit notes here.
				</p>
			</Shell>
		);
	if (store.status === "error")
		return (
			<Shell>
				<p role="alert" data-testid="boot-error">
					Could not open local storage: {store.error}
				</p>
			</Shell>
		);
	if (store.status !== "ready" || !store.profile)
		return (
			<Shell>
				<p>Opening local library…</p>
			</Shell>
		);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (await store.add(title, body)) {
			setTitle("");
			setBody("");
		}
	};

	return (
		<Shell>
			<section className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
				<span data-testid="profile">
					{store.profile.kind === "guest" ? "Guest" : store.profile.displayName}
				</span>
				<span>·</span>
				<span data-testid="pending-sync">
					{store.pendingSync} change(s) waiting to sync (no server configured)
				</span>
				{store.profiles.length > 1 && (
					<select
						aria-label="Switch profile"
						className="rounded bg-slate-800 px-2 py-1"
						value={store.profile.id}
						onChange={(e) => void store.switchTo(e.target.value)}
					>
						{store.profiles.map((p) => (
							<option key={p.id} value={p.id}>
								{p.displayName}
							</option>
						))}
					</select>
				)}
			</section>

			<form onSubmit={submit} className="mt-4 grid gap-2">
				<input
					aria-label="Title"
					data-testid="title"
					className="rounded bg-slate-800 px-3 py-2"
					placeholder="Title"
					value={title}
					maxLength={120}
					onChange={(e) => setTitle(e.target.value)}
				/>
				<textarea
					aria-label="Body"
					data-testid="body"
					className="rounded bg-slate-800 px-3 py-2"
					placeholder="Note"
					rows={3}
					value={body}
					onChange={(e) => setBody(e.target.value)}
				/>
				<button
					type="submit"
					data-testid="add"
					disabled={store.busy}
					className="justify-self-start rounded bg-sky-600 px-4 py-2 font-medium disabled:opacity-50"
				>
					Add note
				</button>
			</form>

			{store.message && (
				<output data-testid="message" className="mt-3 block text-amber-300">
					{store.message}
				</output>
			)}

			<ul className="mt-6 grid gap-3" data-testid="notes">
				{store.notes.map((note) => (
					<NoteItem key={note.id} note={note} />
				))}
			</ul>

			{store.profile.kind === "guest" && <AccountPanel />}

			<footer className="mt-8 text-xs text-slate-500" data-testid="engine">
				{store.info?.engine} · files: {store.info?.fileStore}
			</footer>
		</Shell>
	);
}

function Shell({ children }: { children: ReactNode }) {
	return (
		<main className="min-h-screen bg-[#06192e] px-4 py-6 text-slate-100">
			<div className="mx-auto max-w-xl">
				<header className="mb-4 flex items-center justify-between">
					<h1 className="text-xl font-semibold">Notes (offline)</h1>
					<Link to="/" className="text-sm text-sky-300">
						Library
					</Link>
				</header>
				{children}
			</div>
		</main>
	);
}
