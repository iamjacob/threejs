import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { books } from "../../lib/bookCatalog";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useBookStore, useSelectedBook } from "../../stores/useBookStore";

export default function BookBar({
	id,
	onClose,
}: {
	id: string;
	onClose: () => void;
}) {
	const book = useSelectedBook();
	const selectBook = useBookStore((state) => state.selectBook);
	const barRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		barRef.current
			?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
			?.focus();
	}, []);

	return (
		<div
			ref={barRef}
			id={id}
			role="dialog"
			aria-label="Change book"
			className="absolute top-[calc(100%+0.5rem)] right-2 z-30 w-[calc(100%-1rem)] max-w-[420px] rounded-xl border border-white/15 bg-[#111a2b]/95 p-2 shadow-xl backdrop-blur-xl"
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.stopPropagation();
					onClose();
					return;
				}
				if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
				event.preventDefault();
				event.stopPropagation();
				const buttons = Array.from(
					barRef.current?.querySelectorAll<HTMLButtonElement>(
						"[data-book-id]",
					) ?? [],
				);
				const index = buttons.indexOf(
					document.activeElement as HTMLButtonElement,
				);
				buttons[
					(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
						buttons.length
				]?.focus();
			}}
		>
			<div className="flex min-h-10 items-center justify-between gap-2 pl-1">
				<p className="truncate text-base text-white/85" aria-live="polite">
					{book.title}
				</p>
				<button
					type="button"
					aria-label="Close book bar"
					onClick={onClose}
					className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/60 hover:bg-white/10"
				>
					<X size={16} aria-hidden="true" />
				</button>
			</div>
			<div className="flex gap-2 overflow-x-auto overscroll-x-contain px-1 pt-1 pb-2 [scrollbar-width:thin]">
				{books.map((item) => (
					<button
						key={item.id}
						type="button"
						data-book-id={item.id}
						aria-label={`${item.title} by ${item.author}`}
						title={`${item.title} · ${item.author}`}
						aria-pressed={book.id === item.id}
						onClick={() => selectBook(item.id)}
						className="flex h-20 w-14 shrink-0 cursor-pointer items-center justify-center rounded-md p-1 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-white aria-pressed:bg-white/10 aria-pressed:opacity-100"
					>
						<img
							src={publicAssetUrl(item.cover.front)}
							alt=""
							className="h-full w-full object-contain"
							draggable={false}
						/>
					</button>
				))}
			</div>
		</div>
	);
}
