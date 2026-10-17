import { useBookStore } from "../stores/useBookStore";
import { useLevelStore } from "../stores/useLevelStore";
import { useShelfControlsStore } from "../../stores/useShelfControlsStore";
import { loopLibrary } from "./libraryLoops";
import { readBookIds, REMOVED_BOOKS_KEY } from "./bookPreferences";
export function watchLibraryLoops() {
	let syncing = false;
	const sync = () => {
		if (syncing) return;
		syncing = true;
		try {
			const library = useBookStore.getState();
			const level = useLevelStore.getState().libraryLevel;
			const books = loopLibrary(library.books, level);
			const shelf = useShelfControlsStore.getState();
			const removed = readBookIds(REMOVED_BOOKS_KEY);
			const items = { ...shelf.document.items };
			const order = [...shelf.document.order];
			const stacks = [...shelf.document.stacks];
			const groups = [...shelf.document.groups];
			const newCopies: string[] = [];
			let changed = false;
			for (const book of books) {
				if (items[book.id] || removed.includes(book.id)) continue;
				const source = book.loopSourceId ? items[book.loopSourceId] : undefined;
				items[book.id] = source
					? { ...source }
					: {
							shelf: order.length % 4,
							layout: "upright",
							angle: 0,
							face: "cover",
						};
				order.push(book.id);
				if (book.loopSourceId) newCopies.push(book.id);
				changed = true;
			}
			// New volumes form straight, spine-out runs; existing user arrangements survive.
			for (let offset = 0; offset < newCopies.length; offset += 24) {
				const cluster = newCopies.slice(offset, offset + 24);
				const row = Math.floor(offset / 24) % 4;
				cluster.forEach((id) => {
					items[id] = {
						shelf: row,
						layout: "upright",
						angle: 0,
						face: "spine",
					};
				});
				groups.push({
					id: `display-group:${cluster[0]}`,
					name: `Collection ${Math.floor(offset / 24) + 1}`,
					bookIds: cluster,
				});
			}
			if (changed || shelf.document.fullCircle !== (level === 10))
				useShelfControlsStore.setState({
					document: {
						...shelf.document,
						items,
						order,
						stacks,
						groups,
						fullCircle: level === 10,
					},
				});
			if (
				books.length !== library.books.length ||
				books.some((b, i) => b.id !== library.books[i]?.id)
			) {
				const selected = library.books.find(
					(b) => b.id === library.selectedBookId,
				);
				useBookStore.setState({ books });
				if (!books.some((b) => b.id === library.selectedBookId))
					useBookStore
						.getState()
						.selectBook(selected?.loopSourceId ?? books[0].id);
				useShelfControlsStore.setState({
					selectedIds: shelf.selectedIds.filter((id) =>
						books.some((b) => b.id === id),
					),
				});
			}
		} finally {
			syncing = false;
		}
	};
	const stopLevel = useLevelStore.subscribe((s, p) => {
		if (s.libraryLevel !== p.libraryLevel) sync();
	});
	const stopBooks = useBookStore.subscribe((s, p) => {
		if (s.books !== p.books) sync();
	});
	const stopShelf = useShelfControlsStore.subscribe((s, p) => {
		if (
			s.document !== p.document &&
			s.document.fullCircle !== (useLevelStore.getState().libraryLevel === 10)
		)
			sync();
	});
	sync();
	return () => {
		stopLevel();
		stopBooks();
		stopShelf();
	};
}
