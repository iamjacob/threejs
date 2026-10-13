import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	ArrowDownUp,
	Check,
	ChevronDown,
	ChevronRight,
	ChevronUp,
	Rotate3D,
	GripVertical,
	Group,
	Layers3,
	LibraryBig,
	Plus,
	Redo2,
	RotateCcw,
	RotateCw,
	CopyCheck,
	Search,
	SlidersHorizontal,
	Trash2,
	Undo2,
	UserRound,
	Cuboid,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	type ShelfLayout,
	useShelfControlsStore,
} from "../../../stores/useShelfControlsStore";
import { useBookStore, useLibraryBooks } from "../../stores/useBookStore";
import { bookImagePath } from "../../lib/bookImages";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useTourStore } from "../../stores/useTourStore";
import {
	BookFaceIcon,
	BookGroupIcon,
	LayoutIcon,
	ShelfButton,
	ShelfRange,
} from "./ShelfKit";
import "./shelf-controls.css";

const layouts: { value: ShelfLayout; label: string }[] = [
	{ value: "upright", label: "Upright" },
	{ value: "lean", label: "Lean" },
	{ value: "flat", label: "Flat" },
	{ value: "stack", label: "Stack" },
	{ value: "fan", label: "Fan" },
];
const titleOf = (id: string) =>
	useBookStore.getState().books.find((book) => book.id === id)?.title ?? "Book";

export default function ShelfControls() {
	const books = useLibraryBooks();
	const state = useShelfControlsStore();
	const {
		document: shelf,
		selectedIds,
		activeStackId,
		panel,
		multiSelect,
		past,
		future,
	} = state;
	const [picker, setPicker] = useState<"select" | "add" | null>(null);
	const [groupName, setGroupName] = useState("");
	const [draggedId, setDraggedId] = useState<string | null>(null);
	const stack = shelf.stacks.find((entry) => entry.id === activeStackId);
	const first = shelf.items[selectedIds[0]];
	const canChangeFace =
		selectedIds.length > 0 &&
		!stack &&
		selectedIds.every((id) => shelf.items[id]?.layout !== "flat");
	const selectedGroup = shelf.groups.find(
		(group) =>
			group.bookIds.length === selectedIds.length &&
			group.bookIds.every((id) => selectedIds.includes(id)),
	);
	const angle = first?.angle ?? 0;
	const zoomLabel =
		state.zoomMode === "library"
			? "All"
			: state.zoomMode === "shelf"
				? "Shelf"
				: "Book";
	const nextZoomLabel =
		state.zoomMode === "book"
			? "Shelf"
			: state.zoomMode === "shelf"
				? "All"
				: "Book";
	const layout = stack ? "stack" : first?.layout;
	const mixedLayout =
		!stack && selectedIds.some((id) => shelf.items[id]?.layout !== layout);
	const title = stack
		? `Stack · ${stack.bookIds.length} books`
		: multiSelect
			? `${selectedIds.length} selected`
			: selectedGroup
				? `${selectedGroup.name} · ${selectedGroup.bookIds.length}`
				: selectedIds.length === 1
					? titleOf(selectedIds[0])
					: `My library · ${shelf.order.length}`;
	const close = () => {
		state.endInteraction();
		state.setEditing(false);
		useTourStore.setState({ paused: true });
	};
	useEffect(() => {
		const keydown = (event: KeyboardEvent) => {
			const element = event.target as HTMLElement;
			if (
				element.matches("input, textarea, select") ||
				element.isContentEditable ||
				picker
			)
				return;
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
				event.preventDefault();
				if (event.shiftKey) useShelfControlsStore.getState().redo();
				else useShelfControlsStore.getState().undo();
			}
			if (event.key === "Escape") {
				const current = useShelfControlsStore.getState();
				if (current.drag) {
					current.endBookDrag(false);
					return;
				}
				if (current.multiSelect) current.setMultiSelect(false);
				else if (current.panel === "settings" || current.panel === "group")
					current.setPanel(current.activeStackId ? "stack" : "arrange");
				else current.selectBooks([]);
			}
		};
		window.addEventListener("keydown", keydown);
		return () => window.removeEventListener("keydown", keydown);
	}, [picker]);
	const rangeProps = {
		onStart: state.beginInteraction,
		onEnd: state.endInteraction,
	};
	const showStacks = () => {
		if (stack) state.setPanel(panel === "stack" ? "arrange" : "stack");
		else if (selectedIds.length > 1) state.createStack();
		else if (shelf.stacks[0]) state.selectStack(shelf.stacks[0].id);
		else state.setMultiSelect(true);
	};
	const reorder = (targetId: string) => {
		if (!draggedId || !stack || draggedId === targetId) return;
		const from = stack.bookIds.indexOf(draggedId);
		const to = stack.bookIds.indexOf(targetId);
		state.beginInteraction();
		for (let step = 0; step < Math.abs(to - from); step++)
			state.moveInStack(draggedId, to > from ? "up" : "down");
		state.endInteraction();
		setDraggedId(null);
	};
	return (
		<section
			className="shelf-editor"
			aria-label="Shelf editor"
			data-dragging={Boolean(state.drag)}
		>
			<header className="shelf-editor-header">
				<button
					type="button"
					className="shelf-pill shelf-library-button"
					disabled={Boolean(state.drag)}
					onClick={() => setPicker("select")}
					aria-haspopup="dialog"
					aria-label={`Choose books: ${title}`}
				>
					<span>{title}</span>
					{stack ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
				</button>
				<ShelfButton
					label="Close shelf editor"
					onClick={close}
					className="shelf-pill"
				>
					<X size={22} />
				</ShelfButton>
			</header>
			<button
				type="button"
				className="shelf-pill shelf-zoom-button"
				disabled={Boolean(state.drag)}
				onClick={state.cycleZoom}
				aria-label={`Zoom: ${zoomLabel}. Tap for ${nextZoomLabel}.`}
				title={`Zoom: ${zoomLabel} → ${nextZoomLabel}`}
			>
				<Layers3 size={17} /> <span>{zoomLabel}</span>
				<span className="shelf-zoom-steps" aria-hidden="true">
					{["book", "shelf", "library"].map((mode) => (
						<i key={mode} data-active={state.zoomMode === mode} />
					))}
				</span>
			</button>

			<div className="shelf-dock" inert={Boolean(state.drag)}>
				{(multiSelect || selectedIds.length !== 1) && (
					<div className="shelf-selection-caption">
						<span>
							{stack
								? `Stack · ${stack.bookIds.length} books`
								: multiSelect
									? "Tap books to build your selection"
									: selectedIds.length === 1
										? titleOf(selectedIds[0])
										: selectedIds.length
											? `${selectedIds.length} books selected`
											: "Select a book on your shelf"}
						</span>
						{multiSelect && (
							<button type="button" onClick={() => state.setMultiSelect(false)}>
								Done <Check size={14} />
							</button>
						)}
					</div>
				)}

				{panel === "stack" && stack ? (
					<>
						<ol
							className="shelf-stack-list shelf-glass"
							aria-label="Stack order, top to bottom"
						>
							{[...stack.bookIds].reverse().map((id, index) => (
								<li
									key={id}
									draggable
									onDragStart={(event) => {
										setDraggedId(id);
										event.dataTransfer.effectAllowed = "move";
										event.dataTransfer.setData("text/plain", id);
									}}
									onDragEnd={() => setDraggedId(null)}
									onDragOver={(event) => event.preventDefault()}
									onDrop={(event) => {
										event.preventDefault();
										reorder(id);
									}}
									className={draggedId === id ? "is-dragging" : ""}
								>
									<GripVertical
										size={16}
										className="shelf-grip"
										aria-hidden="true"
									/>
									<span className="shelf-stack-number">
										{stack.bookIds.length - index}
									</span>
									<span className="shelf-stack-title" title={titleOf(id)}>
										{titleOf(id)}
									</span>
									<ShelfButton
										label={`Move ${titleOf(id)} up`}
										disabled={index === 0}
										onClick={() => state.moveInStack(id, "up")}
									>
										<ChevronUp size={21} />
									</ShelfButton>
									<ShelfButton
										label={`Move ${titleOf(id)} down`}
										disabled={index === stack.bookIds.length - 1}
										onClick={() => state.moveInStack(id, "down")}
									>
										<ChevronDown size={21} />
									</ShelfButton>
								</li>
							))}
						</ol>
						<div className="shelf-pill shelf-toggle-row">
							<span id="alternate-spines-label">Alternate spines</span>
							<button
								type="button"
								className="shelf-switch"
								role="switch"
								aria-checked={stack.alternateSpines}
								aria-labelledby="alternate-spines-label"
								onClick={state.toggleAlternateSpines}
							>
								<span />
							</button>
						</div>
						<div className="shelf-action-row">
							<button
								type="button"
								className="shelf-primary"
								onClick={() => setPicker("add")}
								disabled={shelf.order.every((id) => stack.bookIds.includes(id))}
							>
								<Plus size={20} /> Add on top
							</button>
							<button
								type="button"
								className="shelf-pill shelf-text-button"
								onClick={state.unstack}
							>
								Unstack
							</button>
						</div>
					</>
				) : panel === "group" ? (
					<div className="shelf-glass shelf-panel">
						<div className="shelf-panel-title">
							<h2>Bring books together</h2>
							<ShelfButton
								label="Close grouping"
								onClick={() => state.setPanel(stack ? "stack" : "arrange")}
							>
								<X size={18} />
							</ShelfButton>
						</div>
						<div className="shelf-menu-options">
							<button
								type="button"
								onClick={() => state.groupBy("author", books)}
							>
								<UserRound size={18} />
								<span>Group by author</span>
								<ChevronRight size={17} />
							</button>
							<button
								type="button"
								onClick={() => state.groupBy("height", books)}
							>
								<ArrowDownUp size={18} />
								<span>Sort by height</span>
								<ChevronRight size={17} />
							</button>
							<button
								type="button"
								onClick={() => state.groupBy("none", books)}
								disabled={!shelf.groups.length}
							>
								<Group size={18} />
								<span>Clear groups</span>
							</button>
						</div>
						<form
							className="shelf-group-form"
							onSubmit={(event) => {
								event.preventDefault();
								state.groupSelection(groupName);
								setGroupName("");
							}}
						>
							<label htmlFor="shelf-group-name">
								Name your selection · {selectedIds.length} books
							</label>
							<div>
								<input
									id="shelf-group-name"
									value={groupName}
									onChange={(event) => setGroupName(event.target.value)}
									placeholder="e.g. Sunday reading"
									maxLength={40}
								/>
								<button
									type="submit"
									disabled={selectedIds.length < 2 || !groupName.trim()}
									aria-label="Create named group"
								>
									<Plus size={20} />
								</button>
							</div>
						</form>
						{selectedGroup && (
							<button
								type="button"
								className="shelf-subtle-button"
								onClick={state.ungroup}
							>
								Ungroup {selectedGroup.name}
							</button>
						)}
					</div>
				) : panel === "settings" ? (
					<div className="shelf-glass shelf-panel">
						<div className="shelf-panel-title">
							<h2>A little fine-tuning</h2>
							<ShelfButton
								label="Close settings"
								onClick={() => state.setPanel(stack ? "stack" : "arrange")}
							>
								<X size={18} />
							</ShelfButton>
						</div>
						<div className="shelf-setting">
							<span>View</span>
							<div className="shelf-small-segment">
								{(
									[
										["front", "Front"],
										["threeQuarter", "3/4"],
										["top", "Above"],
									] as const
								).map(([value, label]) => (
									<button
										key={value}
										type="button"
										aria-pressed={state.shelfView === value}
										onClick={() => state.setShelfView(value)}
									>
										{label}
									</button>
								))}
							</div>
						</div>
						<div className="shelf-setting">
							<span>Facing</span>
							<div className="shelf-small-segment">
								{(["cover", "spine", "back"] as const).map((face) => (
									<button
										key={face}
										type="button"
										disabled={!canChangeFace}
										aria-pressed={first?.face === face}
										onClick={() => state.setFace(face)}
									>
										{face}
									</button>
								))}
							</div>
						</div>
						<div className="shelf-setting">
							<span>Align</span>
							<div className="shelf-small-segment">
								{(
									[
										{ value: "left", icon: AlignLeft },
										{ value: "center", icon: AlignCenter },
										{ value: "right", icon: AlignRight },
									] as const
								).map(({ value, icon: Icon }) => (
									<ShelfButton
										key={value}
										label={`Align ${value}`}
										active={shelf.alignment === value}
										onClick={() => state.setAlignment(value)}
									>
										<Icon size={19} />
									</ShelfButton>
								))}
							</div>
						</div>
						<label className="shelf-setting shelf-spacing">
							<span>
								Spacing <output>{Math.round(shelf.spacing * 100)}%</output>
							</span>
							<ShelfRange
								label="Book spacing"
								value={shelf.spacing}
								min={0.03}
								max={0.3}
								step={0.01}
								onChange={state.setSpacing}
								{...rangeProps}
							/>
						</label>
						<div className="shelf-setting">
							<label htmlFor="move-to-shelf">Move to shelf</label>
							<select
								id="move-to-shelf"
								value={first?.shelf ?? 3}
								disabled={!selectedIds.length}
								onChange={(event) =>
									state.moveToShelf(Number(event.target.value))
								}
							>
								{[3, 2, 1, 0].map((shelf) => (
									<option key={shelf} value={shelf}>
										{4 - shelf}
										{shelf === 3 ? " · Top" : shelf === 0 ? " · Bottom" : ""}
									</option>
								))}
							</select>
						</div>
						<button
							type="button"
							className="shelf-subtle-button"
							onClick={() => state.reset(books)}
						>
							<RotateCcw size={16} /> Restore original arrangement
						</button>
					</div>
				) : (
					<>
						<div className="shelf-layout-row">
							<span className="shelf-pill shelf-layout-label">Layout</span>
							<div
								className="shelf-pill shelf-layout-options"
								role="group"
								aria-label="Book layout"
							>
								{layouts.map(({ value, label }) => (
									<ShelfButton
										key={value}
										label={`${label} layout`}
										active={!mixedLayout && layout === value}
										disabled={
											!selectedIds.length ||
											((value === "stack" || value === "fan") &&
												selectedIds.length < 2)
										}
										onClick={() => state.setLayout(value)}
									>
										<LayoutIcon layout={value} />
									</ShelfButton>
								))}
							</div>
						</div>
						<div className="shelf-rotation-row">
							<ShelfButton
								label="Rotate left 5 degrees"
								className="shelf-pill"
								disabled={!selectedIds.length || Boolean(stack)}
								onClick={() => state.stepAngle(-5)}
							>
								<RotateCcw size={21} />
							</ShelfButton>
							<div className="shelf-pill shelf-angle-slider">
								<ShelfRange
									label="Book tilt"
									disabled={!selectedIds.length || Boolean(stack)}
									min={-45}
									max={45}
									value={angle}
									onChange={state.setAngle}
									{...rangeProps}
								/>
								<output>{angle}°</output>
							</div>
							<ShelfButton
								label="Rotate right 5 degrees"
								className="shelf-pill"
								disabled={!selectedIds.length || Boolean(stack)}
								onClick={() => state.stepAngle(5)}
							>
								<RotateCw size={21} />
							</ShelfButton>
							<ShelfButton
								label="Flip book facing"
								className="shelf-pill"
								disabled={!selectedIds.length}
								onClick={() =>
									stack
										? state.flipStack()
										: state.setFace(first?.face === "back" ? "cover" : "back")
								}
							>
								<Rotate3D size={19} />
							</ShelfButton>
						</div>
					</>
				)}

				{panel === "stack" && stack ? (
					<nav className="shelf-pill shelf-toolbar" aria-label="Stack tools">
						<ShelfButton
							label="Undo"
							disabled={!past.length}
							onClick={state.undo}
						>
							<Undo2 size={21} />
						</ShelfButton>
						<ShelfButton
							label="Flip stack"
							active={stack.flipped}
							onClick={state.flipStack}
						>
							<Rotate3D size={19} />
						</ShelfButton>
						<ShelfButton label="Stand books upright" onClick={state.unstack}>
							<LayoutIcon layout="upright" />
						</ShelfButton>
						<ShelfButton
							label="Reverse stack order"
							onClick={state.reverseStack}
						>
							<ArrowDownUp size={21} />
						</ShelfButton>
						<ShelfButton
							label="Stack settings"
							onClick={() => state.setPanel("settings")}
						>
							<SlidersHorizontal size={20} />
						</ShelfButton>
						<ShelfButton
							label="Remove stack from shelf"
							className="shelf-danger"
							onClick={state.removeSelection}
						>
							<Trash2 size={20} />
						</ShelfButton>
					</nav>
				) : (
					<nav
						className="shelf-pill shelf-toolbar"
						aria-label="Arrangement tools"
					>
						<ShelfButton
							label="Select multiple books"
							active={multiSelect}
							onClick={() => state.setMultiSelect(!multiSelect)}
						>
							<CopyCheck size={19} />
						</ShelfButton>
						<ShelfButton
							label="Cycle cover, spine and back"
							disabled={!canChangeFace}
							active={first?.face === "spine"}
							onClick={() =>
								state.setFace(
									first?.face === "cover"
										? "spine"
										: first?.face === "spine"
											? "back"
											: "cover",
								)
							}
						>
							<BookFaceIcon face={first?.face ?? "cover"} />
						</ShelfButton>
						<ShelfButton
							label={
								selectedIds.length > 1 && !stack
									? "Stack selected books"
									: "Edit a stack"
							}
							active={Boolean(stack)}
							onClick={showStacks}
						>
							<LayoutIcon layout="stack" />
						</ShelfButton>
						<ShelfButton
							label="Group books"
							active={panel === "group"}
							onClick={() =>
								state.setPanel(panel === "group" ? "arrange" : "group")
							}
						>
							<BookGroupIcon />
						</ShelfButton>
						<ShelfButton
							label="Change shelf view"
							active={state.shelfView !== "front"}
							onClick={() =>
								state.setShelfView(
									state.shelfView === "front"
										? "threeQuarter"
										: state.shelfView === "threeQuarter"
											? "top"
											: "front",
								)
							}
						>
							<Cuboid size={19} />
						</ShelfButton>
						<ShelfButton
							label="Shelf settings"
							active={panel === "settings"}
							onClick={() =>
								state.setPanel(
									panel === "settings"
										? stack
											? "stack"
											: "arrange"
										: "settings",
								)
							}
						>
							<SlidersHorizontal size={20} />
						</ShelfButton>
					</nav>
				)}
				<div className="shelf-history-row">
					<button type="button" disabled={!past.length} onClick={state.undo}>
						<Undo2 size={14} /> Undo
					</button>
					<span>
						{multiSelect
							? `${selectedIds.length} selected`
							: "Drag books to arrange"}
					</span>
					<button type="button" disabled={!future.length} onClick={state.redo}>
						Redo <Redo2 size={14} />
					</button>
				</div>
			</div>
			<p className="shelf-sr-only" role="status" aria-live="polite">
				{state.message}
			</p>
			{picker && <BookPicker mode={picker} onClose={() => setPicker(null)} />}
		</section>
	);
}

function BookPicker({
	mode,
	onClose,
}: {
	mode: "select" | "add";
	onClose: () => void;
}) {
	const books = useLibraryBooks();
	const state = useShelfControlsStore();
	const [search, setSearch] = useState("");
	const dialog = useRef<HTMLDialogElement>(null);
	const stack = state.document.stacks.find(
		(entry) => entry.id === state.activeStackId,
	);
	const visible = books.filter(
		(book) =>
			state.document.items[book.id] &&
			(mode !== "add" || !stack?.bookIds.includes(book.id)) &&
			`${book.title} ${book.author}`
				.toLowerCase()
				.includes(search.toLowerCase()),
	);
	useEffect(() => {
		const element = dialog.current;
		element?.showModal();
		return () => element?.close();
	}, []);
	return (
		<dialog
			ref={dialog}
			className="shelf-book-picker shelf-glass"
			aria-labelledby="shelf-picker-title"
			onCancel={onClose}
			onClick={(event) => {
				if (event.target === event.currentTarget) {
					const rect = event.currentTarget.getBoundingClientRect();
					if (
						event.clientX < rect.left ||
						event.clientX > rect.right ||
						event.clientY < rect.top ||
						event.clientY > rect.bottom
					)
						onClose();
				}
			}}
		>
			<div className="shelf-panel-title">
				<div>
					<p>
						{mode === "add" ? "ONE MORE GOOD BOOK" : "MAKE YOURSELF AT HOME"}
					</p>
					<h2 id="shelf-picker-title">
						{mode === "add" ? "Add to your stack" : "Your library"}
					</h2>
				</div>
				<ShelfButton label="Close book picker" onClick={onClose}>
					<X size={20} />
				</ShelfButton>
			</div>
			<label className="shelf-search">
				<Search size={18} />
				<input
					aria-label="Search your books"
					placeholder="Find a book or author"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					autoFocus
				/>
			</label>
			{mode === "select" && !search && (
				<div className="shelf-picker-collections">
					<button
						type="button"
						onClick={() => {
							state.selectBooks(state.document.order);
							state.setMultiSelect(true);
							onClose();
						}}
					>
						<LibraryBig size={17} /> All books{" "}
						<span>{state.document.order.length}</span>
					</button>
					{state.document.stacks.map((entry, index) => (
						<button
							key={entry.id}
							type="button"
							onClick={() => {
								state.selectStack(entry.id);
								onClose();
							}}
						>
							<Layers3 size={17} />{" "}
							{entry.id === "business-stack"
								? "Business stack"
								: `Stack ${index + 1}`}
							<span>{entry.bookIds.length}</span>
						</button>
					))}
					{state.document.groups.map((group) => (
						<button
							key={group.id}
							type="button"
							onClick={() => {
								state.selectGroup(group.id);
								onClose();
							}}
						>
							<Group size={17} /> {group.name}
							<span>{group.bookIds.length}</span>
						</button>
					))}
				</div>
			)}
			<div className="shelf-picker-books">
				{visible.length ? (
					visible.map((book) => (
						<button
							key={book.id}
							type="button"
							onClick={() => {
								if (mode === "add") state.addToStack(book.id);
								else state.selectBook(book.id);
								if (!state.multiSelect || mode === "add") onClose();
							}}
							aria-pressed={
								mode === "select"
									? state.selectedIds.includes(book.id)
									: undefined
							}
						>
							<img
								src={publicAssetUrl(bookImagePath(book.cover.front, "low"))}
								alt=""
							/>
							<span>
								<strong>{book.title}</strong>
								<small>{String(book.author).replaceAll(",", ", ")}</small>
							</span>
							{mode === "add" ? (
								<Plus size={18} />
							) : state.selectedIds.includes(book.id) ? (
								<Check size={18} />
							) : (
								<ChevronRight size={16} />
							)}
						</button>
					))
				) : (
					<p className="shelf-empty">
						No books found. Try another title or author.
					</p>
				)}
			</div>
		</dialog>
	);
}
