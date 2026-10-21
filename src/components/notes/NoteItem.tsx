import { useEffect, useState } from "react";
import type { Note } from "../../data/schema";
import { useNotesStore } from "../../stores/useNotesStore";

export function NoteItem({ note }: { note: Note }) {
	const { edit, remove, attach, imageUrl, busy } = useNotesStore();
	const [src, setSrc] = useState<string>();
	useEffect(() => {
		if (!note.fileId) return;
		let url: string | undefined;
		let live = true;
		void imageUrl(note.fileId).then((value) => {
			url = value;
			if (live) setSrc(value);
		});
		return () => {
			live = false;
			if (url) URL.revokeObjectURL(url);
		};
	}, [note.fileId, imageUrl]);

	return (
		<li className="rounded bg-slate-900 p-3" data-testid="note">
			<div className="flex items-start justify-between gap-2">
				<strong data-testid="note-title">
					{note.pinned ? "📌 " : ""}
					{note.title}
				</strong>
				<div className="flex gap-3 text-sm text-sky-300">
					<button
						type="button"
						disabled={busy}
						onClick={() => void edit(note.id, { pinned: !note.pinned })}
					>
						{note.pinned ? "Unpin" : "Pin"}
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={() => {
							const next = prompt("Edit title", note.title);
							if (next !== null) void edit(note.id, { title: next });
						}}
					>
						Edit
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={() => void attach(note.id)}
					>
						Image
					</button>
					<button
						type="button"
						data-testid="delete"
						disabled={busy}
						onClick={() => void remove(note.id)}
					>
						Delete
					</button>
				</div>
			</div>
			{note.body && (
				<p className="mt-1 whitespace-pre-wrap text-slate-300">{note.body}</p>
			)}
			{src && <img src={src} alt="" className="mt-2 max-h-48 rounded" />}
		</li>
	);
}

export function AccountPanel() {
	const { promote, lookupAccount, busy } = useNotesStore();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	return (
		<section className="mt-8 grid gap-2 rounded border border-slate-800 p-3 text-sm">
			<h2 className="font-medium">Keep your notes in an account</h2>
			<p className="text-slate-400">
				Finding an existing account needs a server, which is not available yet.
				You can create a local account profile on this device; guest notes are
				copied, never deleted.
			</p>
			<div className="flex gap-2">
				<input
					aria-label="Email"
					className="flex-1 rounded bg-slate-800 px-2 py-1"
					placeholder="Email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
				<button
					type="button"
					data-testid="lookup"
					disabled={busy}
					onClick={() => void lookupAccount(email)}
				>
					Find account
				</button>
			</div>
			<div className="flex gap-2">
				<input
					aria-label="Your name"
					data-testid="account-name"
					className="flex-1 rounded bg-slate-800 px-2 py-1"
					placeholder="Your name"
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
				<button
					type="button"
					data-testid="promote"
					disabled={busy || !name.trim()}
					onClick={() => void promote(name)}
				>
					Create local account
				</button>
			</div>
		</section>
	);
}
