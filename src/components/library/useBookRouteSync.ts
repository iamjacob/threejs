import { useMatch, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useShelfControlsStore } from "../../../stores/useShelfControlsStore";
import { canOpenBook, resetBookAccess } from "../../lib/bookAccess";
import {
	type BookTarget,
	historyMove,
	isTransient,
	resolveBook,
	sameTarget,
	targetFromView,
	targetKey,
} from "../../lib/bookRoutes";
import { useBookStore } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";
import { applyBookTarget } from "./applyBookTarget";

/** Why a book URL could not be shown (rendered by BookRouteNotice). */
export type BookRouteProblem = {
	kind: "missing" | "unreadable" | "locked";
	id: string;
	/** The URL (target key) this notice belongs to; it clears when the URL changes. */
	at: string;
};

const toPath = (t: BookTarget) =>
	t.kind === "library"
		? ({ to: "/" } as const)
		: t.kind === "book"
			? ({ to: "/book/$bookId", params: { bookId: t.id } } as const)
			: ({ to: "/read/$bookId", params: { bookId: t.id } } as const);

/**
 * Two-way sync between the book routes and the shelves' existing state:
 * - URL → shelves (direct entry, refresh, Back/Forward): after the scene has booted and local
 *   books are hydrated, open the card/reader for the id, or report a problem.
 * - shelves → URL (taps in the scene): push when going deeper, pop when going back up to the
 *   entry just below, replace for another book at the same depth.
 */
export function useBookRouteSync(sceneBooted: boolean) {
	const router = useRouter();
	const bookMatch = useMatch({
		from: "/_shelves/book/$bookId",
		shouldThrow: false,
	});
	const readMatch = useMatch({
		from: "/_shelves/read/$bookId",
		shouldThrow: false,
	});
	const urlTarget: BookTarget = readMatch
		? { kind: "read", id: readMatch.params.bookId }
		: bookMatch
			? { kind: "book", id: bookMatch.params.bookId }
			: { kind: "library" };
	const urlKey = targetKey(urlTarget);
	const [problem, setProblem] = useState<BookRouteProblem>();
	const keysByIndex = useRef(new Map<number, string>());
	/** The view the URL last drove; store changes that already match it are not echoed back. */
	const applied = useRef("");
	/** True while the URL is driving the scene: its intermediate states are not URL changes. */
	const applying = useRef(false);
	const urlTargetRef = useRef(urlTarget);
	urlTargetRef.current = urlTarget;

	useEffect(() => resetBookAccess(), []);

	useEffect(() => {
		keysByIndex.current.set(router.history.location.state.__TSR_index, urlKey);
		if (!sceneBooted) return;
		const target = urlTargetRef.current;
		let cancelled = false;
		setProblem(undefined);
		const drive = (view: BookTarget) => {
			applying.current = true;
			try {
				applyBookTarget(view, true);
			} finally {
				applying.current = false;
			}
			applied.current = targetKey(view);
		};
		/**
		 * Shows `view` instead of the URL's target, with a notice. The URL is kept as typed, so a
		 * refresh shows the same honest state; the next tap in the scene replaces it.
		 */
		const fallBack = (view: BookTarget, kind: BookRouteProblem["kind"]) => {
			if (target.kind === "library") return;
			drive(view);
			setProblem({ kind, id: target.id, at: urlKey });
		};
		void (async () => {
			if (target.kind === "library") return drive(target);
			const shelf = useShelfControlsStore.getState();
			const result = resolveBook(
				target.id,
				useBookStore.getState().books,
				target.kind,
				(id) => !shelf.initialized || Boolean(shelf.document.items[id]),
			);
			if (result.status === "redirect") {
				void router.navigate({
					...toPath({ ...target, id: result.id }),
					replace: true,
				});
				return;
			}
			const access =
				result.status === "missing" ? false : await canOpenBook(target.id);
			if (cancelled) return;
			// Another person's scan gets the same message as a bad id (existence is not revealed).
			if (result.status === "missing" || access === false)
				return fallBack({ kind: "library" }, "missing");
			if (access === "locked") return fallBack({ kind: "library" }, "locked");
			if (result.status === "unreadable")
				return fallBack({ kind: "book", id: target.id }, "unreadable");
			drive(target);
		})();
		return () => {
			cancelled = true;
		};
	}, [urlKey, sceneBooted, router]);

	useEffect(() => {
		if (!sceneBooted) return;
		let queued = false;
		// One decision per burst of store writes (actions write several times in a row).
		const schedule = () => {
			if (queued || applying.current) return;
			queued = true;
			queueMicrotask(() => {
				queued = false;
				sync();
			});
		};
		const sync = () => {
			if (applying.current) return;
			const tour = useTourStore.getState();
			// Settle on stable views only (card shown, reader open), not the flights between them.
			if (isTransient(tour)) return;
			const books = useBookStore.getState();
			const next = targetFromView(tour, books.selectedBookId, books.books);
			const key = targetKey(next);
			if (key === applied.current) return;
			applied.current = key;
			const from = urlTargetRef.current;
			if (sameTarget(from, next)) return;
			setProblem(undefined);
			const index = router.history.location.state.__TSR_index;
			const move = historyMove(from, next, keysByIndex.current.get(index - 1));
			if (move === "back") router.history.back();
			else
				void router.navigate({ ...toPath(next), replace: move === "replace" });
		};
		const stopTour = useTourStore.subscribe((s, p) => {
			if (
				s.reader !== p.reader ||
				s.bookPanel !== p.bookPanel ||
				s.stage !== p.stage
			)
				schedule();
		});
		const stopBooks = useBookStore.subscribe((s, p) => {
			if (s.selectedBookId !== p.selectedBookId) schedule();
		});
		return () => {
			stopTour();
			stopBooks();
		};
	}, [sceneBooted, router]);

	return { problem, dismissProblem: () => setProblem(undefined) };
}
