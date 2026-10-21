import { Stats } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { createFileRoute } from "@tanstack/react-router";
import { Pause, Sparkles } from "lucide-react";
import BoooksController from "../components/layout/BoooksController";
import MessagesOverlay from "../components/layout/MessagesOverlay";
import RenderStats from "../components/layout/RenderStats";
import ShaderWarmup from "../components/layout/ShaderWarmup";
import TimerOverlay from "../components/layout/TimerOverlay";
import { currentRenderQuality } from "../lib/renderQuality";
import { watchLibraryLoops } from "../lib/syncLibraryLoops";

const renderQuality = currentRenderQuality();

import { type MouseEvent, Suspense, useEffect, useRef, useState } from "react";
import { useShelfControlsStore } from "../../stores/useShelfControlsStore";
import Header from "../components/layout/header/header";
import LibraryMenus from "../components/layout/LibraryMenus";
import MarkLoader from "../components/layout/MarkLoader";
import SceneEnvironment from "../components/layout/SceneEnvironment";
import SceneToolbar from "../components/layout/SceneToolbar";
import ShelfControls from "../components/layout/ShelfControls";
import ShelfPlateEditor from "../components/layout/ShelfPlateEditor";
import BookInfoCard from "../components/library/BookInfoCard";
import HelixNav from "../components/library/HelixNav";
import Lightning from "../components/lightning/Lightning";
import ReaderOverlay from "../components/reader/ReaderOverlay";
import BookScanner from "../components/scanner/BookScanner";
import {
	type BookScan,
	loadScannedBooks,
	saveScannedBook,
	scannedBook,
} from "../components/scanner/scannedBook";
import { BOOKS_SHELF_LEVEL } from "../components/shelves/shelfBooks";
import { setControllerJoystickMode } from "../components/tour/controllerJoystick";
import TourCamera from "../components/tour/TourCamera";
import TourDirector from "../components/tour/TourDirector";
import TourOverlay from "../components/tour/TourOverlay";
import TourScene from "../components/tour/TourScene";
import { REMOVED_BOOKS_KEY, readBookIds } from "../lib/bookPreferences";
import { coverFacesOutsideAtlas } from "../lib/coverAtlas";
import { useFeatureFlags } from "../lib/featureFlags";
import {
	ensureRuntimeAtlas,
	registerInitialAtlasHydration,
	useRuntimeAtlas,
} from "../lib/runtimeAtlas";
import { useBookStore, useSelectedBook } from "../stores/useBookStore";

import { useLevelStore } from "../stores/useLevelStore";
import { usePresentationStore } from "../stores/usePresentationStore";
import { useShelfPlatesStore } from "../stores/useShelfPlatesStore";
import { useTourStore } from "../stores/useTourStore";

export const Route = createFileRoute("/")({ component: Home });

function SceneScreenshot({
	onCaptured,
}: {
	onCaptured: (dataUrl: string) => void;
}) {
	const { gl, scene, camera } = useThree();
	const screenshotKey = usePresentationStore((state) => state.screenshotKey);
	const lastKey = useRef(screenshotKey);
	useEffect(() => {
		if (screenshotKey === lastKey.current) return;
		lastKey.current = screenshotKey;
		try {
			gl.render(scene, camera);
			const dataUrl = gl.domElement.toDataURL("image/png");
			onCaptured(dataUrl);
		} catch {
			/* Fallback if canvas is tainted. */
		}
	}, [screenshotKey, gl, scene, camera, onCaptured]);
	return null;
}

function hydrateInitialLibrary() {
	return registerInitialAtlasHydration(async () => {
		const shelf = useShelfControlsStore.getState();
		if (!shelf.initialized) {
			shelf.initialize(useBookStore.getState().books);
		}
		const saved = await loadScannedBooks();
		if (!saved.length) return;
		await ensureRuntimeAtlas(
			saved.flatMap((entry) => coverFacesOutsideAtlas(entry.cover)),
		);
		useBookStore.setState((state) => ({
			books: [
				...state.books,
				...saved.filter(
					(entry) => !state.books.some((book) => book.id === entry.id),
				),
			],
		}));
		const selection = useShelfControlsStore.getState().selectedIds;
		const removed = readBookIds(REMOVED_BOOKS_KEY);
		for (const entry of saved) {
			if (!removed.includes(entry.id)) shelf.insertBook(entry.id);
		}
		useShelfControlsStore.setState({
			selectedIds: selection,
			past: [],
			future: [],
		});
	});
}

function Home() {
	// Start IndexedDB + unified atlas hydration before Canvas/InstancedBooks render
	// so `<Suspense>` waits for local books and reveals all books in the same frame.
	if (typeof window !== "undefined") {
		void hydrateInitialLibrary();
	}
	const { SHOW_DEMO_UI, SHOW_HELIX_NAV } = useFeatureFlags();
	const atlasReady = useRuntimeAtlas((state) => state.ready);
	const sceneReady = useTourStore((state) => state.ready);
	const [sceneBooted, setSceneBooted] = useState(
		() => atlasReady && sceneReady,
	);
	useEffect(() => {
		if (!sceneBooted && atlasReady && sceneReady) {
			setSceneBooted(true);
		}
	}, [sceneBooted, atlasReady, sceneReady]);

	const platesOpen = useShelfPlatesStore((state) => state.editorOpen);
	const showStats =
		typeof window !== "undefined" &&
		new URLSearchParams(window.location.search).has("controls");
	const [scanning, setScanning] = useState(false);
	const [messagesOpen, setMessagesOpen] = useState(false);
	const [timerOpen, setTimerOpen] = useState(false);
	const [shutterFlash, setShutterFlash] = useState(false);
	const scannerOpener = useRef<HTMLElement | null>(null);
	const [notice, setNotice] = useState("");
	const stage = useTourStore((state) => state.stage);
	const bookPanel = useTourStore((state) => state.bookPanel);
	const reader = useTourStore((state) => state.reader);
	const adding = useTourStore((state) => state.userAddition);
	const wasAdding = useRef(false);
	const book = useSelectedBook();
	const editing = useShelfControlsStore((state) => state.editing);
	const environment = usePresentationStore((state) => state.environment);
	const cinematicPlaying = usePresentationStore(
		(state) => state.cinematicPlaying,
	);

	const editableStage = stage === "library" || stage === "pick";
	const showShelfControls = !scanning && editing && editableStage;
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
	useEffect(() => {
		if (wasAdding.current && !adding)
			setNotice(
				(current) => current || `“${book.title}” added. Hold the book to edit.`,
			);
		wasAdding.current = adding;
	}, [adding, book.title]);
	useEffect(() => {
		const shelf = useShelfControlsStore.getState();
		if (!shelf.initialized) {
			shelf.initialize(useBookStore.getState().books);
		}
		const stopLoops = watchLibraryLoops();
		useTourStore.getState().start();
		useTourStore.setState({ paused: true });
		void hydrateInitialLibrary();
		return () => {
			stopLoops();
		};
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
	const toggleScanner = (event: MouseEvent<HTMLButtonElement>) => {
		if (scanning) {
			closeScanner();
			return;
		}
		openScanner(event.currentTarget);
	};
	const addBook = async (scan: BookScan) => {
		const newBook = await scannedBook(scan);
		let saved = true;
		await Promise.all([
			saveScannedBook(newBook).catch(() => {
				saved = false;
			}),
			ensureRuntimeAtlas(coverFacesOutsideAtlas(newBook.cover)),
		]);
		useBookStore.getState().addBook(newBook);
		useShelfControlsStore.getState().insertBook(newBook.id);
		useShelfControlsStore.getState().setEditing(false);
		useTourStore.getState().addScannedBook(newBook.id);
		setScanning(false);
		setNotice(
			saved ? "" : "Added for this visit. Device storage is unavailable.",
		);
	};

	const controllerAction = (id: string, on?: boolean) => {
		const tour = useTourStore.getState();
		switch (id) {
			case "scan":
				openScanner();
				break;
			case "play": {
				let playing = false;
				if (typeof on === "boolean") {
					usePresentationStore.getState().setCinematicPlaying(on);
					playing = on;
				} else {
					playing = usePresentationStore.getState().toggleCinematicPlaying();
				}
				if (playing) {
					if (tour.bookPanel !== "closed") tour.dismissPreview();
					useTourStore.setState({ paused: false });
					setNotice("Playing Hollywood · Zen shelf reel");
				} else {
					useTourStore.setState({ paused: true });
					setNotice("Paused shelf reel");
				}
				break;
			}
			case "screenshot":
				setShutterFlash(true);
				window.setTimeout(() => setShutterFlash(false), 320);
				usePresentationStore.getState().requestScreenshot();
				break;
			case "chat":
				setMessagesOpen(true);
				break;
			case "zoom":
				setControllerJoystickMode(on ? "zoom" : "look");
				break;
			case "jump": {
				const books = useBookStore.getState().books;
				const candidates = books.filter(
					(item) => item.id !== useBookStore.getState().selectedBookId,
				);
				const target =
					candidates[Math.floor(Math.random() * candidates.length)] ?? books[0];
				if (target) tour.previewBook(target.id);
				break;
			}
			case "cam":
				useLevelStore.getState().setLibraryLevel(on ? 10 : BOOKS_SHELF_LEVEL);
				break;
			case "lamp":
				if (on) usePresentationStore.getState().replayLightShow();
				usePresentationStore.getState().toggleLighting();
				break;
			case "home":
				usePresentationStore.getState().setCinematicPlaying(false);
				useTourStore.setState((state) => ({
					paused: true,
					focusRevision: state.focusRevision + 1,
				}));
				break;
			case "timer":
				setTimerOpen(true);
				break;
			case "shelf":
				if (tour.bookPanel !== "closed") tour.dismissPreview();
				else
					useShelfControlsStore
						.getState()
						.setEditing(!useShelfControlsStore.getState().editing);
				break;
			case "quote":
				if (tour.bookPanel === "closed")
					tour.previewBook(useBookStore.getState().selectedBookId);
				else tour.openReader();
				break;
			case "map": {
				const scenes = ["library", "castle", "forest", "zen"] as const;
				usePresentationStore
					.getState()
					.setEnvironment(
						scenes[(scenes.indexOf(environment) + 1) % scenes.length],
					);
				break;
			}
		}
	};
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
			{sceneBooted && !scanning && (
				<button
					type="button"
					className="menu-logo fixed left-3 top-[calc(0.5rem+env(safe-area-inset-top))] z-[1600]"
					data-scanning={scanning}
					onClick={toggleScanner}
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
			)}
			{sceneBooted &&
				SHOW_DEMO_UI &&
				!scanning &&
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
			{sceneBooted &&
				!scanning &&
				!editing &&
				reader === "closed" &&
				["library", "pick", "end", "grow"].includes(stage) && (
					<BoooksController
						onAction={controllerAction}
						activeToggles={{ play: cinematicPlaying }}
					/>
				)}
			{cinematicPlaying && !scanning && reader === "closed" && (
				<>
					<div className="pointer-events-none fixed inset-x-0 top-0 z-[1400] h-12 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-700" />
					<div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1400] h-12 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-700" />
					<button
						type="button"
						onClick={() => {
							usePresentationStore.getState().setCinematicPlaying(false);
							useTourStore.setState({ paused: true });
						}}
						className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[1650] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#0b1022]/85 px-4 py-1.5 text-xs font-medium text-[#f5efe2] shadow-lg backdrop-blur-md transition hover:border-[#e22424]/60"
					>
						<Pause size={13} className="text-[#e22424]" />
						<span>Hollywood · Zen Reel</span>
					</button>
				</>
			)}
			{shutterFlash && (
				<div className="pointer-events-none fixed inset-0 z-[2400] bg-white/80 animate-out fade-out duration-300" />
			)}
			{messagesOpen && !scanning && (
				<MessagesOverlay onClose={() => setMessagesOpen(false)} />
			)}
			{sceneBooted && !scanning && (
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
			{sceneBooted && reader === "closed" && !scanning && (
				<LibraryMenus
					scanning={scanning}
					showActions={!scanning && editableStage}
					onAddBook={() => openScanner()}
				/>
			)}
			{!scanning &&
				!editing &&
				reader === "closed" &&
				bookPanel !== "closed" && <BookInfoCard />}
			{sceneBooted &&
				SHOW_HELIX_NAV &&
				!scanning &&
				!editing &&
				reader === "closed" &&
				["library", "pick", "pull", "read", "return", "end"].includes(
					stage,
				) && <HelixNav />}
			{!scanning && adding && (
				<output className="library-add-status">
					<Sparkles size={16} />
					<span>Bringing “{book.title}” to your shelf</span>
				</output>
			)}
			{!scanning && bookPanel === "closed" && notice && (
				<output className="library-notice">{notice}</output>
			)}
			{!scanning && reader === "closed" && <MarkLoader />}
			<div
				className={`fixed inset-0 transition-opacity duration-700 ease-out ${
					sceneBooted ? "opacity-100" : "opacity-0"
				}`}
				data-scene={stage}
				inert={scanning || reader !== "closed" || !sceneBooted}
				aria-hidden={scanning || reader !== "closed" || !sceneBooted}
			>
				{atlasReady && (
					<Canvas
						frameloop={scanning || reader === "open" ? "never" : "always"}
						shadows={renderQuality.shadows ? "percentage" : false}
						dpr={renderQuality.dpr}
						// A transparent canvas forces per-frame page compositing and locks many
						// phones to 30 fps; the scene paints its own background instead.
						gl={{ alpha: false, powerPreference: "high-performance" }}
						camera={{ position: [0, 4, 8], fov: 45, near: 0.01, far: 500 }}
					>
						<Suspense fallback={null}>
							<SceneEnvironment />
							<TourScene />
							<Lightning />
							<ShaderWarmup />
						</Suspense>
						<TourCamera />
						<TourDirector />
						<SceneScreenshot
							onCaptured={(dataUrl) => {
								const link = document.createElement("a");
								link.href = dataUrl;
								link.download = `boooks-shelf-${Date.now()}.png`;
								link.click();
								setNotice("Screenshot saved!");
							}}
						/>
						{showStats && <Stats />}
						{showStats && <RenderStats />}
					</Canvas>
				)}
			</div>
			{SHOW_DEMO_UI &&
				!scanning &&
				reader === "closed" &&
				bookPanel === "closed" && <TourOverlay />}
			{!scanning && reader === "open" && <ReaderOverlay />}
		</div>
	);
}
