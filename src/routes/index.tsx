import { Stats } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import BoooksController from "../components/layout/BoooksController";
import RenderStats from "../components/layout/RenderStats";
import ShaderWarmup from "../components/layout/ShaderWarmup";
import { currentRenderQuality } from "../lib/renderQuality";
import { watchLibraryLoops } from "../lib/syncLibraryLoops";

const renderQuality = currentRenderQuality();

import { type MouseEvent, Suspense, useEffect, useRef, useState } from "react";
import { useShelfControlsStore } from "../../stores/useShelfControlsStore";
import Header from "../components/layout/header/header";
import LibraryMenus from "../components/layout/LibraryMenus";
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
import { useFeatureFlags } from "../lib/featureFlags";
import { useBookStore, useSelectedBook } from "../stores/useBookStore";
import { useLevelStore } from "../stores/useLevelStore";
import { usePresentationStore } from "../stores/usePresentationStore";
import { useShelfPlatesStore } from "../stores/useShelfPlatesStore";
import { useTourStore } from "../stores/useTourStore";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const { SHOW_DEMO_UI, SHOW_HELIX_NAV } = useFeatureFlags();
	const platesOpen = useShelfPlatesStore((state) => state.editorOpen);
	const showStats =
		typeof window !== "undefined" &&
		new URLSearchParams(window.location.search).has("controls");
	const [scanning, setScanning] = useState(false);
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
		shelf.initialize(useBookStore.getState().books);
		const stopLoops = watchLibraryLoops();
		useTourStore.getState().start();
		useTourStore.setState({ paused: true });
		let active = true;
		void loadScannedBooks()
			.then((saved) => {
				if (!active) return;
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
			})
			.catch(() => {
				/* Scanning still works if private browsing disables storage. */
			});
		return () => {
			stopLoops();
			active = false;
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
		try {
			await saveScannedBook(newBook);
		} catch {
			saved = false;
		}
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
				useTourStore.setState((state) => ({
					paused: true,
					focusRevision: state.focusRevision + 1,
				}));
				break;
			case "timer":
				tour.togglePause();
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
			{!scanning && (
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
			{SHOW_DEMO_UI &&
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
			{!scanning &&
				!editing &&
				reader === "closed" &&
				["library", "pick", "end", "grow"].includes(stage) && (
					<BoooksController onAction={controllerAction} />
				)}
			{scanning && <BookScanner onClose={closeScanner} onAdd={addBook} />}
			{showShelfControls && <ShelfControls />}
			{platesOpen && !scanning && <ShelfPlateEditor />}
			{reader === "closed" && !scanning && (
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
			{SHOW_HELIX_NAV &&
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
			<div
				className="fixed inset-0"
				data-scene={stage}
				inert={scanning || reader !== "closed"}
				aria-hidden={scanning || reader !== "closed"}
			>
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
					</Suspense>
					<TourCamera />
					<TourDirector />
					<Lightning />
					<ShaderWarmup />
					{showStats && <Stats />}
					{showStats && <RenderStats />}
				</Canvas>
			</div>
			{SHOW_DEMO_UI &&
				!scanning &&
				reader === "closed" &&
				bookPanel === "closed" && <TourOverlay />}
			{!scanning && reader === "open" && <ReaderOverlay />}
		</div>
	);
}
