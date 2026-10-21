import { useProgress } from "@react-three/drei";
import {
	ArrowLeft,
	ArrowUpRight,
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
import { type ReactNode, useEffect, useRef } from "react";
import { useParticleStore } from "../../../stores/useParticleStore";
import { useShelfControlsStore } from "../../../stores/useShelfControlsStore";
import { useFeatureFlags } from "../../lib/featureFlags";
import { useLibraryBooks, useSelectedBook } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";
import BookPageSwiper from "../openbook/BookPageSwiper";

import ShakeToRead from "../reader/ShakeToRead";
import ControlHint from "./ControlHint";
import LibraryCount from "./LibraryCount";
import { tourChapters, tourStages } from "./tourStages";

function Timeline() {
	const books = useLibraryBooks();
	const stage = useTourStore((state) => state.stage);
	const elapsed = useTourStore((state) => state.elapsed);
	const action = useTourStore((state) => state.action);
	const enter = useTourStore((state) => state.enter);
	const deleted = useTourStore((state) => state.deletedBookIds.length);
	const deleting = useTourStore((state) => state.deletingBooks);
	const navRef = useRef<HTMLElement>(null);
	const particles = useParticleStore((state) => state.particleProgress);
	const index = tourChapters.findIndex(
		(chapter) =>
			chapter.stage ===
			(stage === "pull" || stage === "return" ? "read" : stage),
	);
	useEffect(() => {
		const nav = navRef.current;
		const button = nav?.children[index] as HTMLElement | undefined;
		if (!nav || !button) return;
		nav.scrollTo({
			left: Math.max(
				0,
				button.offsetLeft + button.offsetWidth / 2 - nav.clientWidth / 2,
			),
			behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
				? "instant"
				: "smooth",
		});
	}, [index]);
	const duration = tourStages[stage].duration;
	const progress = duration
		? Math.min(1, elapsed / duration)
		: stage === "delete"
			? (deleted +
					Object.values(deleting).reduce(
						(sum, startedAt) => sum + Math.min(1, (elapsed - startedAt) / 2.4),
						0,
					)) /
				books.length
			: stage === "add"
				? particles
				: action === "done"
					? 1
					: 0;
	return (
		<nav
			ref={navRef}
			aria-label="Demo timeline"
			className="fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-3xl gap-0.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] sm:gap-2"
		>
			{tourChapters.map((chapter, i) => (
				<button
					type="button"
					key={chapter.stage}
					aria-label={`Jump to ${chapter.label}`}
					aria-current={i === index ? "step" : undefined}
					title={chapter.label}
					onClick={() => enter(chapter.stage)}
					className="group flex min-h-11 min-w-max flex-1 basis-auto sm:min-w-0 sm:basis-0 cursor-pointer flex-col justify-center gap-2 rounded px-px sm:px-0.5 focus-visible:outline-2 focus-visible:outline-white"
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
	hint,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<ControlHint hint={hint}>
			<button
				type="button"
				aria-label={label}
				title={label}
				onClick={onClick}
				disabled={disabled}
				className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#0c1424]/20 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white disabled:cursor-default disabled:opacity-35 ${hint ? "ring-1 ring-white/60" : ""}`}
			>
				{children}
			</button>
		</ControlHint>
	);
}

export default function TourOverlay() {
	const { SHOW_TOUR_TEXT } = useFeatureFlags();
	const books = useLibraryBooks();
	const editing = useShelfControlsStore((state) => state.editing);
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
	const usedHints = useTourStore((state) => state.usedHints);
	const dismissHint = useTourStore((state) => state.dismissHint);
	const deleted = useTourStore((state) => state.deletedBookIds.length);
	const deleting = useTourStore(
		(state) => Object.keys(state.deletingBooks).length,
	);
	const resetDeletedBooks = useTourStore((state) => state.resetDeletedBooks);
	const showHint = (key: string) =>
		!loading && reader === "closed" && !usedHints.includes(key);
	const hint =
		stage === "pick"
			? "Tap any cover on the shelf."
			: stage === "privacy"
				? "Tap a book to censor or reveal it."
				: stage === "delete"
					? "Tap any book to delete it."
					: null;
	if (editing && (stage === "library" || stage === "pick")) return null;
	return (
		<>
			<ShakeToRead />
			{SHOW_TOUR_TEXT && (
				<div
					key={stage}
					className="tour-caption pointer-events-none fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-5 z-20 max-w-[calc(100%-2.5rem)] [text-shadow:0_1px_8px_#080d1a] sm:left-10 sm:max-w-md"
					aria-live="polite"
				>
					{stage === "end" && (
						<a
							href="https://boooks.app"
							target="_blank"
							rel="noopener noreferrer"
							className="pointer-events-auto mb-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-2 text-base font-medium text-white backdrop-blur-sm hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
						>
							Join the waitlist <ArrowUpRight size={18} aria-hidden="true" />
						</a>
					)}
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
			)}
			<aside
				style={stage === "library" ? { top: "calc(50% + 64px)" } : undefined}
				className="fixed right-2 top-1/2 z-30 flex w-11 -translate-y-1/2 flex-col items-center gap-1 sm:right-5"
				aria-label="Demo controls"
			>
				{stage === "pick" && (
					<IconButton
						label="Back to shelves"
						onClick={() => {
							useTourStore.getState().enter("library");
						}}
						disabled={loading}
					>
						<ArrowLeft size={20} />
					</IconButton>
				)}
				{stage === "pick" && (
					<IconButton
						label="Open book"
						onClick={advance}
						disabled={loading}
						hint={showHint("pick") ? "Or press here" : undefined}
					>
						<BookOpen size={20} />
					</IconButton>
				)}
				{stage === "read" && (
					<IconButton
						label={reader === "zooming" ? "Opening reader" : "Read book"}
						onClick={() => {
							dismissHint("reader");
							openReader();
						}}
						disabled={
							loading ||
							reader !== "closed" ||
							(!book.epub && !book.pdf && !book.scanPages?.length)
						}
						hint={
							usedHints.includes("drag") && showHint("reader")
								? "Press here"
								: undefined
						}
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
						<ControlHint hint={showHint("drag") ? "Drag here" : undefined}>
							<BookPageSwiper
								key={book.id}
								embedded
								onInteract={() => {
									dismissHint("drag");
									useTourStore.setState({ paused: true });
								}}
							/>
						</ControlHint>
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
						label={blurred === books.length ? "Reveal books" : "Censor books"}
						onClick={toggleAllBlur}
						disabled={loading}
						hint={showHint("censor") ? "Tap a book or blur all" : undefined}
					>
						{blurred === books.length ? (
							<Eye size={20} />
						) : (
							<EyeOff size={20} />
						)}
					</IconButton>
				)}
				{stage === "delete" && (
					<IconButton
						label={deleted === books.length ? "Restore books" : "Delete a book"}
						onClick={deleted === books.length ? resetDeletedBooks : runAction}
						disabled={
							loading || (deleted + deleting === books.length && deleting > 0)
						}
						hint={showHint("delete") ? "Press here" : undefined}
					>
						{deleted === books.length ? (
							<RotateCcw size={20} />
						) : (
							<Trash2 size={20} />
						)}
					</IconButton>
				)}
				{stage === "add" && (
					<IconButton
						label={
							action === "running"
								? "Adding books"
								: action === "done"
									? deleted
										? "Add next book"
										: "Add books again"
									: "Add books"
						}
						onClick={runAction}
						disabled={loading || action === "running"}
						hint={
							action === "idle" && showHint("add") ? "Press here" : undefined
						}
					>
						{action === "running" ? (
							<LoaderCircle
								size={20}
								className="animate-spin motion-reduce:animate-none"
							/>
						) : action === "done" && !deleted ? (
							<RotateCcw size={20} />
						) : (
							<Plus size={20} />
						)}
					</IconButton>
				)}
				{(stage === "privacy" ||
					((stage === "delete" || stage === "add") && action === "done")) && (
					<IconButton
						label="Continue"
						onClick={advance}
						disabled={loading}
						hint={
							!loading &&
							(stage === "privacy"
								? usedHints.includes("censor")
								: action === "done")
								? "Press here"
								: undefined
						}
					>
						<ChevronRight size={20} />
					</IconButton>
				)}
				{stage === "end" && (
					<IconButton label="Play again" onClick={advance} disabled={loading}>
						<RotateCcw size={20} />
					</IconButton>
				)}
				<IconButton
					label={paused ? "Play demo" : "Pause demo"}
					onClick={togglePause}
				>
					{paused ? <Play size={18} /> : <Pause size={18} />}
				</IconButton>
			</aside>
			<Timeline />
		</>
	);
}
