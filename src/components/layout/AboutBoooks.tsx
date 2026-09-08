import { ArrowRight, X } from "lucide-react";
import { useEffect, useRef } from "react";

type AboutBoooksProps = {
	isOpen: boolean;
	onClose: () => void;
	onExplore: () => void;
};

export default function AboutBoooks({
	isOpen,
	onClose,
	onExplore,
}: AboutBoooksProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (isOpen && !dialog.open) dialog.showModal();
		if (!isOpen && dialog.open) dialog.close();
	}, [isOpen]);

	return (
		<dialog
			ref={dialogRef}
			closedby="any"
			onClose={onClose}
			aria-labelledby="about-boooks-title"
			aria-describedby="about-boooks-description"
			className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#172554]/95 p-6 text-stone-100 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:p-8"
		>
			<div className="mb-5 flex items-start justify-between gap-4">
				<div>
					<p className="mb-2 text-sm font-medium text-[#f34b54]">Boooks R3F!</p>
					<h2 id="about-boooks-title" className="text-2xl font-medium">
						About Boooks
					</h2>
				</div>
				<button
					type="button"
					onClick={() => dialogRef.current?.close()}
					aria-label="Close about Boooks"
					className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
				>
					<X size={18} aria-hidden="true" />
				</button>
			</div>
			<p
				id="about-boooks-description"
				className="text-base leading-relaxed text-stone-200"
			>
				Boooks explores a more playful digital library — a place where books
				come to life and shelves grow with your collection.
			</p>
			<p className="mt-4 text-sm leading-relaxed text-stone-300">
				This playground is a peek at that experience. Explore books in 3D, turn
				their pages, watch the shelves expand, and try the animations for adding
				and removing books. Pick a demo from the Components menu and make
				yourself at home.
			</p>
			<button
				type="button"
				onClick={onExplore}
				className="mt-6 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#d91b24] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#b9161e]"
			>
				Explore 3D Book
				<ArrowRight size={18} aria-hidden="true" />
			</button>
		</dialog>
	);
}
