import { type FormEvent, useEffect, useState } from "react";
import type { LibraryBook } from "../../data/schema";
import { useBookManagerStore } from "../../stores/useBookManagerStore";

const field = "min-h-11 rounded-lg bg-slate-800 px-3";
const FIELDS = [
	["title", "Title", 300],
	["author", "Author(s)", 200],
	["subtitle", "Subtitle", 200],
	["edition", "Edition", 200],
	["publisher", "Publisher", 200],
	["isbn", "ISBN (as printed; optional)", 40],
] as const;

/** Edits this person's own entry. Catalog facts are not changed by saving here. */
const fromBook = (book: LibraryBook) => ({
	title: book.title,
	author: book.author,
	subtitle: book.subtitle ?? "",
	edition: book.edition ?? "",
	publisher: book.publisher ?? "",
	isbn: book.isbn ?? "",
	pages: book.expectedPageCount ? String(book.expectedPageCount) : "",
});

export default function MetadataForm({ book }: { book: LibraryBook }) {
	const busy = useBookManagerStore((s) => s.busy);
	const [values, setValues] = useState(() => fromBook(book));
	const [saved, setSaved] = useState(false);
	// After a save the stored (trimmed, normalized) values come back with a new revision.
	// biome-ignore lint/correctness/useExhaustiveDependencies: refresh only when the stored revision changes.
	useEffect(() => {
		setValues(fromBook(book));
	}, [book.metadataRevision]);
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const pages = values.pages.trim();
		const ok = await useBookManagerStore.getState().saveMetadata({
			title: values.title,
			author: values.author,
			subtitle: values.subtitle,
			edition: values.edition,
			publisher: values.publisher,
			isbn: values.isbn,
			expectedPageCount: pages ? Number(pages) : null,
		});
		setSaved(ok);
	};
	return (
		<form
			onSubmit={submit}
			aria-labelledby="meta-h"
			className="grid gap-2"
			data-testid="metadata-form"
		>
			<h2 id="meta-h" className="font-medium">
				Your details for this book
			</h2>
			<p className="text-xs text-slate-400">
				These are your own notes about your copy. Saving them does not change
				the shared BOOOKS catalog.
			</p>
			{FIELDS.map(([key, text, max]) => (
				<label key={key} className="grid gap-1 text-sm">
					{text}
					<input
						data-testid={`meta-${key}`}
						className={field}
						maxLength={max}
						required={key === "title"}
						value={values[key]}
						onChange={(e) => {
							setSaved(false);
							setValues((v) => ({ ...v, [key]: e.target.value }));
						}}
					/>
				</label>
			))}
			<label className="grid gap-1 text-sm">
				Number of pages in this edition
				<input
					data-testid="meta-pages"
					className={field}
					inputMode="numeric"
					pattern="[0-9]*"
					value={values.pages}
					onChange={(e) => {
						setSaved(false);
						setValues((v) => ({ ...v, pages: e.target.value }));
					}}
				/>
				<span className="text-xs text-slate-400">
					Needed before the book can count as completely scanned.
				</span>
			</label>
			<div className="flex items-center gap-3">
				<button
					type="submit"
					data-testid="meta-save"
					disabled={busy}
					className="min-h-11 rounded-full bg-[#d91b24] px-5 font-medium text-white disabled:opacity-50"
				>
					Save details
				</button>
				{saved && (
					<output data-testid="meta-saved" className="text-sm text-emerald-300">
						Saved on this device
					</output>
				)}
			</div>
		</form>
	);
}
