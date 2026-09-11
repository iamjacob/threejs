import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { bookImagePath } from "../../lib/bookImages";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useSelectedBook } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";
import { exitReaderFullscreen } from "./readerFullscreen";

export default function ReaderOverlay() {
	const book = useSelectedBook();
	const close = useTourStore((state) => state.closeReader);
	const dialog = useRef<HTMLDialogElement>(null);
	const frame = useRef<HTMLIFrameElement>(null);
	const readingFile = book.epub ?? book.pdf;
	const query = new URLSearchParams({
		book: book.id,
		title: book.title,
		cover: publicAssetUrl(bookImagePath(book.cover.front, "low")),
		...(readingFile ? { url: publicAssetUrl(readingFile) } : {}),
	});
	useEffect(() => {
		const previousFocus = document.activeElement as HTMLElement | null;
		dialog.current?.showModal();
		const receive = (event: MessageEvent) => {
			if (
				event.source === frame.current?.contentWindow &&
				event.origin === window.location.origin &&
				event.data?.type === "close-reader"
			)
				close();
		};
		window.addEventListener("message", receive);
		return () => {
			window.removeEventListener("message", receive);
			exitReaderFullscreen();
			// Wait until React removes the modal and mounts the next chapter.
			queueMicrotask(() => {
				if (document.querySelector("dialog[open]")) return;
				const focusTarget =
					previousFocus?.isConnected && previousFocus !== document.body
						? previousFocus
						: document.querySelector<HTMLButtonElement>(
								'nav[aria-label="Demo timeline"] [aria-current="step"]',
							);
				focusTarget?.focus({ preventScroll: true });
			});
		};
	}, [close]);
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
			<iframe
				ref={frame}
				allowFullScreen
				title={`Read ${book.title}`}
				src={`${publicAssetUrl("/reader/index.html")}?${query}`}
				className="block h-full w-full border-0"
			/>
		</dialog>
	);
}
