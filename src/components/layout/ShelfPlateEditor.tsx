import { useEffect, useRef, useState } from "react";
import { useShelfPlatesStore } from "../../stores/useShelfPlatesStore";
import "./shelf-plates.css";

export default function ShelfPlateEditor() {
	const { labels, save, closeEditor } = useShelfPlatesStore();
	const [draft, setDraft] = useState(labels);
	const dialog = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const element = dialog.current;
		element?.showModal();
		return () => element?.close();
	}, []);
	return (
		<dialog
			ref={dialog}
			className="plate-editor"
			aria-labelledby="plate-title"
			onCancel={closeEditor}
			onKeyDown={(event) => event.stopPropagation()}
		>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					save(draft);
				}}
			>
				<h2 id="plate-title">Gold shelf plates</h2>
				<p>Name each shelf. Leave a name empty to remove its plate.</p>
				{[3, 2, 1, 0].map((shelf, index) => (
					<label key={shelf}>
						<span>
							Shelf {index + 1}
							{index === 0 ? " · Top" : index === 3 ? " · Bottom" : ""}
						</span>
						<input
							autoFocus={index === 0}
							maxLength={36}
							placeholder={
								index === 0 ? "Stoics & seekers" : "Add a shelf name"
							}
							value={draft[shelf]}
							onChange={(event) =>
								setDraft((current) =>
									current.map((text, i) =>
										i === shelf ? event.target.value : text,
									),
								)
							}
						/>
					</label>
				))}
				<footer>
					<button type="button" onClick={closeEditor}>
						Cancel
					</button>
					<button type="submit">Save plates</button>
				</footer>
			</form>
		</dialog>
	);
}
