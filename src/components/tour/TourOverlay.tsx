import { useProgress } from "@react-three/drei";
import {
	BookOpen,
	ChevronRight,
	Eye,
	EyeOff,
	LoaderCircle,
	Pause,
	Play,
	Plus,
	RotateCcw,
	Trash2,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useDissolveStore } from "../../../stores/useDissolveStore";
import { useParticleStore } from "../../../stores/useParticleStore";
import { books } from "../../lib/bookCatalog";
import { useSelectedBook } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";
import MarkLoader from "../layout/MarkLoader";
import BookPageSwiper from "../openbook/BookPageSwiper";
import ReaderOverlay from "../reader/ReaderOverlay";
import LibraryCount from "./LibraryCount";
import { tourChapters, tourStages } from "./tourStages";

function Timeline() {
	const stage = useTourStore((state) => state.stage);
	const elapsed = useTourStore((state) => state.elapsed);
	const action = useTourStore((state) => state.action);
	const enter = useTourStore((state) => state.enter);
	const dissolve = useDissolveStore((state) => state.dissolveProgress);
	const particles = useParticleStore((state) => state.particleProgress);
	const index = tourChapters.findIndex(
		(chapter) =>
			chapter.stage ===
			(stage === "pull" || stage === "return" ? "read" : stage),
	);
	const duration = tourStages[stage].duration;
	const progress = duration
		? Math.min(1, elapsed / duration)
		: stage === "delete"
			? dissolve
			: stage === "add"
				? particles
				: action === "done"
					? 1
					: 0;
	return (
		<nav
			aria-label="Demo timeline"
			className="fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-3xl gap-0.5 sm:gap-2"
		>
			{tourChapters.map((chapter, i) => (
				<button
					type="button"
					key={chapter.stage}
					aria-label={`Jump to ${chapter.label}`}
					aria-current={i === index ? "step" : undefined}
					title={chapter.label}
					onClick={() => enter(chapter.stage)}
					className="group flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center gap-2 rounded px-0.5 focus-visible:outline-2 focus-visible:outline-white"
				>
					<span className="h-0.5 w-full overflow-hidden rounded bg-white/20 group-hover:bg-white/40">
						<span
							className="block h-full bg-white/80"
							style={{
								width: `${(i < index ? 1 : i === index ? progress : 0) * 100}%`,
							}}
						/>
					</span>
					<span
						className={`text-xs min-[380px]:text-sm sm:text-base ${i === index ? "text-white" : "text-white/75"}`}
					>
						{chapter.label}
					</span>
				</button>
			))}
		</nav>
	);
}

function IconButton({
	label,
	onClick,
	disabled = false,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			disabled={disabled}
			className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#0c1424]/20 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white disabled:cursor-default disabled:opacity-35"
		>
			{children}
		</button>
	);
}

export default function TourOverlay() {
	const stage = useTourStore((state) => state.stage);
	const paused = useTourStore((state) => state.paused);
	const ready = useTourStore((state) => state.ready);
	const action = useTourStore((state) => state.action);
	const advance = useTourStore((state) => state.advance);
	const runAction = useTourStore((state) => state.runAction);
	const togglePause = useTourStore((state) => state.togglePause);
	const blurred = useTourStore((state) => state.blurredBookIds.length);
	const toggleAllBlur = useTourStore((state) => state.toggleAllBlur);
	const active = useProgress((state) => state.active);
	const loading = active || !ready;
	const book = useSelectedBook();
	const chapter = tourStages[stage];
	const reader = useTourStore((state) => state.reader);
	const openReader = useTourStore((state) => state.openReader);
	const closeBook = useTourStore((state) => state.closeBook);
	const actionStage = stage === "delete" || stage === "add";
	const hint =
		stage === "library"
			? "Tap a book to open it."
			: stage === "privacy"
				? "Tap a book to blur or reveal it."
				: null;
	return (
		<>
			<div
				key={stage}
				className="tour-caption pointer-events-none fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-5 z-20 max-w-[calc(100%-2.5rem)] [text-shadow:0_1px_8px_#080d1a] sm:left-10 sm:max-w-md"
				aria-live="polite"
			>
				{stage === "grow" ? (
					<LibraryCount />
				) : (
					<h2 className="text-2xl font-medium leading-tight text-white sm:text-3xl">
						{chapter.title}
					</h2>
				)}
				{hint && (
					<p className="mt-2 text-base leading-relaxed text-white/80 sm:text-lg">
						{hint}
					</p>
				)}
			</div>
			<aside
				className="fixed right-2 top-1/2 z-30 flex w-11 -translate-y-1/2 flex-col items-center gap-1 sm:right-5"
				aria-label="Demo controls"
			>
				{stage === "library" && (
					<IconButton label="Open book" onClick={advance} disabled={loading}>
						<BookOpen size={20} />
					</IconButton>
				)}
				{stage === "read" && (
					<IconButton
						label={reader === "zooming" ? "Opening reader" : "Read book"}
						onClick={openReader}
						disabled={loading || reader !== "closed"}
					>
						{reader === "zooming" ? (
							<LoaderCircle
								size={20}
								className="animate-spin motion-reduce:animate-none"
							/>
						) : (
							<BookOpen size={20} />
						)}
					</IconButton>
				)}
				{stage === "read" && reader === "closed" && (
					<>
						<BookPageSwiper
							key={book.id}
							embedded
							onInteract={() => useTourStore.setState({ paused: true })}
						/>
						<IconButton
							label="Close book"
							onClick={closeBook}
							disabled={loading}
						>
							<X size={20} />
						</IconButton>
					</>
				)}
				{stage === "privacy" && (
					<IconButton
						label={blurred === books.length ? "Reveal books" : "Blur books"}
						onClick={toggleAllBlur}
						disabled={loading}
					>
						{blurred === books.length ? (
							<Eye size={20} />
						) : (
							<EyeOff size={20} />
						)}
					</IconButton>
				)}
				{actionStage && (
					<IconButton
						label={
							action === "running"
								? stage === "delete"
									? "Deleting book"
									: "Adding books"
								: action === "done"
									? stage === "delete"
										? "Delete book again"
										: "Add books again"
									: stage === "delete"
										? "Delete book"
										: "Add books"
						}
						onClick={runAction}
						disabled={loading || action === "running"}
					>
						{action === "running" ? (
							<LoaderCircle
								size={20}
								className="animate-spin motion-reduce:animate-none"
							/>
						) : action === "done" ? (
							<RotateCcw size={20} />
						) : stage === "delete" ? (
							<Trash2 size={20} />
						) : (
							<Plus size={20} />
						)}
					</IconButton>
				)}
				{(stage === "privacy" || (actionStage && action === "done")) && (
					<IconButton label="Continue" onClick={advance} disabled={loading}>
						<ChevronRight size={20} />
					</IconButton>
				)}
				{stage === "end" ? (
					<IconButton label="Play again" onClick={advance} disabled={loading}>
						<RotateCcw size={20} />
					</IconButton>
				) : (
					<IconButton
						label={paused ? "Play demo" : "Pause demo"}
						onClick={togglePause}
					>
						{paused ? <Play size={18} /> : <Pause size={18} />}
					</IconButton>
				)}
			</aside>
			<MarkLoader />
			<Timeline />
			{reader === "open" && <ReaderOverlay />}
		</>
	);
}
