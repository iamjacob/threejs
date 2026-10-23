import { type BookTarget, targetFromView } from "../../lib/bookRoutes";
import { useBookStore } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";

/**
 * Puts the existing shelves state machine (useTourStore) into the view a book URL asks for,
 * using its own actions so the scene behaves exactly as when the user taps.
 * `fromHistory`: the change came from the address bar / refresh / Back / Forward, not a tap.
 */
export function applyBookTarget(target: BookTarget, fromHistory: boolean) {
	const tour = useTourStore.getState();
	if (target.kind === "library") {
		if (tour.reader !== "closed") tour.closeReader();
		const after = useTourStore.getState();
		if (after.bookPanel !== "closed") after.dismissPreview();
		return;
	}
	const books = useBookStore.getState();
	const current = targetFromView(tour, books.selectedBookId, books.books);
	if (target.kind === "book") {
		if (tour.reader !== "closed") {
			// Leaving the reader (Back): return to the open book in the scene.
			tour.closeReader();
			if (current.kind !== "library" && current.id === target.id) return;
		}
		if (current.kind === "book" && current.id === target.id) return;
		const now = useTourStore.getState();
		if (now.bookPanel !== "closed" && now.stage === "read") {
			// Another book is open in 3D: the existing navigateBook queues it after the return flight.
			now.navigateBook(target.id);
			return;
		}
		if (now.bookPanel !== "closed") now.enter("library");
		useTourStore.getState().previewBook(target.id);
		return;
	}
	if (current.kind === "read" && current.id === target.id) return;
	// A tap on "Read" is already running the decorative zoom; let it finish.
	if (!fromHistory && tour.reader === "zooming") return;
	// Direct link, refresh or history: straight into the reader (the same path shake-to-resume
	// uses), never waiting on a decorative animation.
	useBookStore.getState().selectBook(target.id);
	tour.enter("read");
	useTourStore.setState({ bookPanel: "open", reader: "open", paused: true });
}
