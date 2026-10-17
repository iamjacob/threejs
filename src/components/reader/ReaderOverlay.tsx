import { useReadingStore } from "../../../stores/useReadingStore";
import BookmarkRibbon from "./BookmarkRibbon";
import { LoaderCircle, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { bookImagePath } from "../../lib/bookImages";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useSelectedBook } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";
import { exitReaderFullscreen } from "./readerFullscreen";

export default function ReaderOverlay() {
	const book = useSelectedBook();
	const close = useTourStore((state) => state.closeReader);
	const dialog = useRef<HTMLDialogElement>(null);
	const surface = useRef<HTMLDivElement>(null);
	const frame = useRef<HTMLIFrameElement>(null);
	const [attempt, setAttempt] = useState(0);
	const [status, setStatus] = useState<"loading" | "slow" | "error" | "ready">(
		"loading",
	);
	const readingFile =
		book.epub ??
		book.pdf ??
		(book.scanPages?.length ? `scan:${book.id}` : undefined);
	const initialPosition = useRef(useReadingStore.getState());
	const query = new URLSearchParams({
		page: String(initialPosition.current.selectedPage),
		fraction: String(initialPosition.current.fraction),
		book: book.id,
		title: book.title,
		cover: publicAssetUrl(bookImagePath(book.cover.front, "low")),
		...(readingFile
			? {
					url: readingFile.startsWith("scan:")
						? readingFile
						: publicAssetUrl(readingFile),
				}
			: {}),
	});
	useLayoutEffect(() => {
		const previousFocus = document.activeElement as HTMLElement | null;
		const readerSurface = surface.current;
		dialog.current?.showModal();

		return () => {
			exitReaderFullscreen(readerSurface);
			// Wait until React removes the modal and mounts the next chapter.
			queueMicrotask(() => {
				if (document.querySelector("dialog[open]")) return;
				const focusTarget =
					previousFocus?.isConnected && previousFocus !== document.body
						? previousFocus
						: document.querySelector<HTMLElement>(
								'[data-book-read], #library-book-picker, nav[aria-label="Demo timeline"] [aria-current="step"]',
							);
				focusTarget?.focus({ preventScroll: true });
			});
		};
	}, []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Each new iframe and retry needs a fresh loading timer and message listener.
	useEffect(() => {
		setStatus("loading");
		const timer = window.setTimeout(
			() => setStatus((current) => (current === "loading" ? "slow" : current)),
			15000,
		);
		const receive = (event: MessageEvent) => {
			if (
				event.source !== frame.current?.contentWindow ||
				event.origin !== window.location.origin
			)
				return;
			if (event.data?.type === "close-reader") close();
			if (event.data?.type === "reader-position")
				useReadingStore.getState().receivePosition(event.data.position);
			if (
				event.data?.type === "reader-ready" ||
				event.data?.type === "reader-error"
			) {
				window.clearTimeout(timer);
				setStatus(event.data.type === "reader-ready" ? "ready" : "error");
			}
		};
		window.addEventListener("message", receive);
		const unsubscribe = useReadingStore.subscribe((state, previous) => {
			if (state.revision !== previous.revision)
				frame.current?.contentWindow?.postMessage(
					{
						type: "reader-go-to",
						position: { index: state.selectedPage, fraction: state.fraction },
					},
					location.origin,
				);
		});
		return () => {
			unsubscribe();
			window.clearTimeout(timer);
			window.removeEventListener("message", receive);
		};
	}, [attempt, book.id, close]);
	return (
		<dialog
			ref={dialog}
			aria-label={`Read ${book.title}`}
			className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-[#f6f3ed] p-0 text-stone-800"
			onCancel={(event) => {
				event.preventDefault();
				close();
			}}
		>
			<div
				ref={surface}
				data-reader-surface
				className="relative h-full w-full overflow-hidden bg-[#f6f3ed]"
			>
				<button
					type="button"
					aria-label="Close reader"
					title="Close reader"
					className="absolute right-[calc(0.5rem+env(safe-area-inset-right))] top-[calc(0.5rem+env(safe-area-inset-top))] z-10 flex h-12 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-950 shadow-lg shadow-black/25 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
					onClick={close}
				>
					<X size={22} strokeWidth={2.5} aria-hidden="true" />
					<span>Close reader</span>
				</button>
				<BookmarkRibbon />
				{status !== "ready" && (
					<output className="absolute bottom-6 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm shadow-lg">
						{status === "loading" && (
							<LoaderCircle
								size={18}
								className="shrink-0 animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
						)}
						<span>
							{status === "error"
								? "The book could not be opened."
								: status === "slow"
									? "This book is taking longer to load."
									: "Opening book…"}
						</span>
						{(status === "slow" || status === "error") && (
							<button
								type="button"
								className="min-h-11 shrink-0 rounded-lg px-3 font-semibold underline"
								onClick={() => setAttempt((value) => value + 1)}
							>
								Retry
							</button>
						)}
					</output>
				)}
				<iframe
					key={`${book.id}-${attempt}`}
					ref={frame}
					onError={() => setStatus("error")}
					allowFullScreen
					title={`Read ${book.title}`}
					src={`${publicAssetUrl("/reader/index.html")}?${query}`}
					className="block h-full w-full border-0"
				/>
			</div>
		</dialog>
	);
}
