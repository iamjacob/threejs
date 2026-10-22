import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import {
	lazy,
	type MouseEvent,
	Suspense,
	useEffect,
	useRef,
	useState,
} from "react";
import { useShelfControlsStore } from "../../stores/useShelfControlsStore";
import BoooksController from "../components/layout/BoooksController";
import Header from "../components/layout/header/header";
import LibraryMenus from "../components/layout/LibraryMenus";
import LibraryScene from "../components/layout/LibraryScene";
import MarkLoader from "../components/layout/MarkLoader";
import { CinematicReelBar } from "../components/layout/SceneScreenshot";
import SceneToolbar from "../components/layout/SceneToolbar";
import { useArriveWhen } from "../components/layout/SceneTransition";
import BookInfoCard from "../components/library/BookInfoCard";
import type { BookScan } from "../components/scanner/scannedBook";
import { runControllerAction } from "../lib/controllerActions";
import { useFeatureFlags } from "../lib/featureFlags";
import {
	addScannedBookToLibrary,
	hydrateInitialLibrary,
} from "../lib/hydrateInitialLibrary";
import { useRuntimeAtlas } from "../lib/runtimeAtlas";
import { watchLibraryLoops } from "../lib/syncLibraryLoops";
import { useBookStore, useSelectedBook } from "../stores/useBookStore";
import { usePresentationStore } from "../stores/usePresentationStore";
import { useShelfPlatesStore } from "../stores/useShelfPlatesStore";
import { useTourStore } from "../stores/useTourStore";

// Heavy overlays only load when opened, keeping the first bundle small.
const BookScanner = lazy(() => import("../components/scanner/BookScanner"));
const ShelfControls = lazy(() => import("../components/layout/ShelfControls"));
const ShelfPlateEditor = lazy(
	() => import("../components/layout/ShelfPlateEditor"),
);
const MessagesOverlay = lazy(
	() => import("../components/layout/MessagesOverlay"),
);
const TimerOverlay = lazy(() => import("../components/layout/TimerOverlay"));
const HelixNav = lazy(() => import("../components/library/HelixNav"));
const ReaderOverlay = lazy(() => import("../components/reader/ReaderOverlay"));
const TourOverlay = lazy(() => import("../components/tour/TourOverlay"));

export const Route = createFileRoute("/")({ component: Home });

const CONTROLLER_STAGES = ["library", "pick", "end", "grow"];
const HELIX_STAGES = ["library", "pick", "pull", "read", "return", "end"];

/** True once the atlas and first scene are ready; never flips back. */
function useSceneBooted() {
	const atlasReady = useRuntimeAtlas((state) => state.ready);
	const sceneReady = useTourStore((state) => state.ready);
	const [booted, setBooted] = useState(() => atlasReady && sceneReady);
	useEffect(() => {
		if (!booted && atlasReady && sceneReady) setBooted(true);
	}, [booted, atlasReady, sceneReady]);
	return booted;
}

function MenuLogo({
	onClick,
}: {
	onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
	return (
		<button
			type="button"
			className="menu-logo fixed left-3 top-[calc(0.5rem+env(safe-area-inset-top))] z-[1600]"
			data-scanning={false}
			onClick={onClick}
			aria-label="Scan a book"
			title="Scan a book"
		>
			<span className="menu-logo-icon">
				<img
					src={`${import.meta.env.BASE_URL}icons/logo.svg`}
					alt=""
					className="h-6 w-6"
				/>
			</span>
			<span className="menu-logo-wordmark">
				<img
					src={`${import.meta.env.BASE_URL}icons/wordmark-gradient.svg`}
					alt="Boooks"
					className="h-auto w-[90px]"
				/>
			</span>
		</button>
	);
}

function Home() {
	// Start IndexedDB + atlas hydration on the first render, in parallel with
	// the Canvas mounting and its textures loading.
	if (typeof window !== "undefined") void hydrateInitialLibrary();
	const { SHOW_DEMO_UI, SHOW_HELIX_NAV } = useFeatureFlags();
	const sceneBooted = useSceneBooted();
	const platesOpen = useShelfPlatesStore((state) => state.editorOpen);
	const showStats =
		typeof window !== "undefined" &&
		new URLSearchParams(window.location.search).has("controls");
	const [scanning, setScanning] = useState(false);
	const [messagesOpen, setMessagesOpen] = useState(false);
	const [timerOpen, setTimerOpen] = useState(false);
	const [shutterFlash, setShutterFlash] = useState(false);
	const [notice, setNotice] = useState("");
	const scannerOpener = useRef<HTMLElement | null>(null);
	const stage = useTourStore((state) => state.stage);
	const bookPanel = useTourStore((state) => state.bookPanel);
	const reader = useTourStore((state) => state.reader);
	const adding = useTourStore((state) => state.userAddition);
	const book = useSelectedBook();
	const editing = useShelfControlsStore((state) => state.editing);
	const cinematicPlaying = usePresentationStore(
		(state) => state.cinematicPlaying,
	);
	const editableStage = stage === "library" || stage === "pick";
	const showShelfControls = !scanning && editing && editableStage;
	const readerClosed = reader === "closed";
	const chrome = sceneBooted && !scanning;
	// Coming back from the map: keep the transition overlay until the shelves have booted.
	useArriveWhen("/", sceneBooted);

	const wasEditing = useRef(editing);
	useEffect(() => {
		if (wasEditing.current && !editing && editableStage) {
			const id = useShelfControlsStore.getState().selectedIds[0];
			if (id) useTourStore.getState().previewBook(id);
		}
		wasEditing.current = editing;
	}, [editing, editableStage]);

	const wasInspecting = useRef(false);
	useEffect(() => {
		if (bookPanel !== "closed") wasInspecting.current = true;
		else if (stage === "library" && !scanning && wasInspecting.current) {
			wasInspecting.current = false;
			document
				.getElementById("library-book-picker")
				?.focus({ preventScroll: true });
		}
	}, [bookPanel, stage, scanning]);

	const wasAdding = useRef(false);
	useEffect(() => {
		if (wasAdding.current && !adding)
			setNotice(
				(current) => current || `“${book.title}” added. Hold the book to edit.`,
			);
		wasAdding.current = adding;
	}, [adding, book.title]);

	useEffect(() => {
		const shelf = useShelfControlsStore.getState();
		if (!shelf.initialized) shelf.initialize(useBookStore.getState().books);
		const stopLoops = watchLibraryLoops();
		useTourStore.getState().start();
		useTourStore.setState({ paused: true });
		return stopLoops;
	}, []);

	useEffect(() => {
		if (!editableStage) useShelfControlsStore.getState().setEditing(false);
	}, [editableStage]);

	useEffect(() => {
		if (!notice) return;
		const timer = window.setTimeout(() => setNotice(""), 6000);
		return () => window.clearTimeout(timer);
	}, [notice]);

	const closeScanner = () => {
		setScanning(false);
		useTourStore.setState({ paused: !SHOW_DEMO_UI || bookPanel !== "closed" });
		requestAnimationFrame(() => {
			// The controller remounts when the scanner closes, so fall back to it.
			const target = scannerOpener.current?.isConnected
				? scannerOpener.current
				: document.querySelector<HTMLElement>(".bc-btn");
			target?.focus({ preventScroll: true });
		});
	};
	const openScanner = (trigger?: HTMLElement) => {
		scannerOpener.current =
			trigger ??
			(document.activeElement instanceof HTMLElement
				? document.activeElement
				: null);
		useShelfControlsStore.getState().setEditing(false);
		useTourStore.setState({ paused: true });
		setNotice("");
		setScanning(true);
	};
	const addBook = async (scan: BookScan) => {
		const saved = await addScannedBookToLibrary(scan);
		setScanning(false);
		setNotice(
			saved ? "" : "Added for this visit. Device storage is unavailable.",
		);
	};
	const controllerAction = (id: string, on?: boolean) =>
		runControllerAction(id, on, {
			openScanner: () => openScanner(),
			openMessages: () => setMessagesOpen(true),
			openTimer: () => setTimerOpen(true),
			flashShutter: () => {
				setShutterFlash(true);
				window.setTimeout(() => setShutterFlash(false), 320);
			},
			notify: setNotice,
		});

	return (
		<div
			className="fixed inset-0 bg-[#080d1a]"
			style={
				showShelfControls
					? {
							background:
								"linear-gradient(165deg, #0b0e29 0%, #141d40 70%, #192448 100%)",
						}
					: undefined
			}
		>
			{chrome && (
				<MenuLogo onClick={(event) => openScanner(event.currentTarget)} />
			)}
			{chrome &&
				SHOW_DEMO_UI &&
				!showShelfControls &&
				bookPanel === "closed" && (
					<div className="library-demo-header">
						<Header showBrand={false}>
							<SceneToolbar
								showBlur={false}
								showBook={false}
								showLighting={false}
							/>
						</Header>
					</div>
				)}
			{chrome &&
				!editing &&
				readerClosed &&
				CONTROLLER_STAGES.includes(stage) && (
					<BoooksController
						onAction={controllerAction}
						activeToggles={{ play: cinematicPlaying }}
					/>
				)}
			{cinematicPlaying && !scanning && readerClosed && <CinematicReelBar />}
			{shutterFlash && (
				<div className="pointer-events-none fixed inset-0 z-[2400] bg-white/80 animate-out fade-out duration-300" />
			)}
			{chrome && readerClosed && (
				<LibraryMenus
					scanning={scanning}
					showActions={editableStage}
					onAddBook={() => openScanner()}
				/>
			)}
			{!scanning && !editing && readerClosed && bookPanel !== "closed" && (
				<BookInfoCard />
			)}
			<Suspense fallback={null}>
				{messagesOpen && !scanning && (
					<MessagesOverlay onClose={() => setMessagesOpen(false)} />
				)}
				{chrome && (
					<TimerOverlay
						open={timerOpen}
						onClose={() => setTimerOpen(false)}
						onOpen={() => setTimerOpen(true)}
						onComplete={(minutes) =>
							setNotice(`Completed ${minutes}-minute reading session!`)
						}
					/>
				)}
				{scanning && <BookScanner onClose={closeScanner} onAdd={addBook} />}
				{showShelfControls && <ShelfControls />}
				{platesOpen && !scanning && <ShelfPlateEditor />}
				{chrome &&
					SHOW_HELIX_NAV &&
					!editing &&
					readerClosed &&
					HELIX_STAGES.includes(stage) && <HelixNav />}
				{SHOW_DEMO_UI &&
					!scanning &&
					readerClosed &&
					bookPanel === "closed" && <TourOverlay />}
				{!scanning && reader === "open" && <ReaderOverlay />}
			</Suspense>
			{!scanning && adding && (
				<output className="library-add-status">
					<Sparkles size={16} />
					<span>Bringing “{book.title}” to your shelf</span>
				</output>
			)}
			{!scanning && bookPanel === "closed" && notice && (
				<output className="library-notice">{notice}</output>
			)}
			{!scanning && readerClosed && <MarkLoader />}
			<LibraryScene
				visible={sceneBooted}
				paused={scanning || reader === "open"}
				interactive={sceneBooted && !scanning && readerClosed}
				stage={stage}
				showStats={showStats}
				onScreenshot={() => setNotice("Screenshot saved!")}
			/>
		</div>
	);
}
