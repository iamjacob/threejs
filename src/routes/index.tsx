import { Stats } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { createFileRoute } from "@tanstack/react-router";
import { ImagePlus, Plus, Sparkles } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useShelfControlsStore } from "../../stores/useShelfControlsStore";
import Header from "../components/layout/header/header";
import SceneEnvironment from "../components/layout/SceneEnvironment";
import SceneToolbar from "../components/layout/SceneToolbar";
import ShelfControls from "../components/layout/ShelfControls";
import BookEditMenu from "../components/library/BookEditMenu";
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
import TourCamera from "../components/tour/TourCamera";
import TourDirector from "../components/tour/TourDirector";
import TourOverlay from "../components/tour/TourOverlay";
import TourScene from "../components/tour/TourScene";
import {
	SHOW_DEMO_UI,
	SHOW_HELIX_NAV,
	SHOW_PICTURE_FRAME,
} from "../lib/featureFlags";
import { useBookStore, useSelectedBook } from "../stores/useBookStore";
import { useTourStore } from "../stores/useTourStore";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const showStats =
		typeof window !== "undefined" &&
		new URLSearchParams(window.location.search).has("controls");
	const [scanning, setScanning] = useState(false);
	const [notice, setNotice] = useState("");
	const [bookMenu, setBookMenu] = useState<{
		id: string;
		position: { x: number; y: number };
	} | null>(null);
	const stage = useTourStore((state) => state.stage);
	const bookPanel = useTourStore((state) => state.bookPanel);
	const reader = useTourStore((state) => state.reader);
	const adding = useTourStore((state) => state.userAddition);
	const wasAdding = useRef(false);
	const book = useSelectedBook();
	const editing = useShelfControlsStore((state) => state.editing);
	const pictureFrameVisible = useShelfControlsStore(
		(state) => state.pictureFrameVisible,
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
		shelf.initialize(useBookStore.getState().books);
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
				for (const entry of saved) shelf.insertBook(entry.id);
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
			active = false;
		};
	}, []);
	useEffect(() => {
		if (!editableStage) useShelfControlsStore.getState().setEditing(false);
		if (!editableStage) setBookMenu(null);
	}, [editableStage]);
	useEffect(() => {
		if (!notice) return;
		const timer = window.setTimeout(() => setNotice(""), 6000);
		return () => window.clearTimeout(timer);
	}, [notice]);
	const closeScanner = () => {
		setScanning(false);
		useTourStore.setState({ paused: !SHOW_DEMO_UI || bookPanel !== "closed" });
	};
	const toggleScanner = () => {
		if (scanning) {
			closeScanner();
			return;
		}
		useShelfControlsStore.getState().setEditing(false);
		useTourStore.setState({ paused: true });
		setNotice("");
		setScanning(true);
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
	const closeBookMenu = () => setBookMenu(null);
	const arrangeBook = () => {
		if (!bookMenu) return;
		const id = bookMenu.id;
		setBookMenu(null);
		useTourStore.getState().previewBook(id);
		useShelfControlsStore.getState().openBookEditor(id);
	};
	const editBookDetails = () => {
		if (!bookMenu) return;
		const id = bookMenu.id;
		setBookMenu(null);
		useTourStore.getState().previewBook(id);
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
			<button
				type="button"
				className="menu-logo fixed left-3 top-[calc(0.5rem+env(safe-area-inset-top))] z-[1600]"
				data-shelf={!scanning}
				onClick={toggleScanner}
				aria-label={scanning ? "Go to shelf" : "Scan a book"}
				title={scanning ? "Go to shelf" : "Scan a book"}
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
			{SHOW_DEMO_UI &&
				!scanning &&
				!showShelfControls &&
				bookPanel === "closed" && (
					<Header showBrand={false}>
						<SceneToolbar
							showBlur={false}
							showBook={false}
							showLighting={false}
						/>
					</Header>
				)}
			{scanning && <BookScanner onClose={closeScanner} onAdd={addBook} />}
			{showShelfControls && <ShelfControls />}
			{!scanning && !editing && editableStage && (
				<div
					className="library-actions library-actions-minimal"
					style={SHOW_DEMO_UI ? { top: 76 } : undefined}
				>
					<button
						type="button"
						aria-label="Scan a book"
						title="Scan a book"
						onClick={() => {
							useTourStore.setState({ paused: true });
							setNotice("");
							setScanning(true);
						}}
					>
						<Plus size={20} aria-hidden="true" />
					</button>
					{SHOW_PICTURE_FRAME && (
						<button
							type="button"
							aria-label={
								pictureFrameVisible
									? "Remove picture frame"
									: "Add picture frame"
							}
							title={
								pictureFrameVisible
									? "Remove picture frame"
									: "Add picture frame"
							}
							aria-pressed={pictureFrameVisible}
							onClick={() =>
								useShelfControlsStore.getState().togglePictureFrame()
							}
						>
							<ImagePlus size={20} aria-hidden="true" />
						</button>
					)}
				</div>
			)}
			{!scanning && !editing && bookPanel !== "closed" && <BookInfoCard />}
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
				inert={scanning || reader === "open"}
				aria-hidden={scanning || reader === "open"}
			>
				<Canvas
					frameloop={scanning || reader === "open" ? "never" : "always"}
					shadows="percentage"
					gl={{ alpha: true }}
					onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
					camera={{ position: [0, 4, 8], fov: 45, near: 0.01, far: 500 }}
				>
					<Suspense fallback={null}>
						<SceneEnvironment />
						<TourScene
							onBookEdit={(id, position) => setBookMenu({ id, position })}
						/>
					</Suspense>
					<TourCamera />
					<TourDirector />
					<Lightning />
					{showStats && <Stats />}
				</Canvas>
			</div>
			{SHOW_DEMO_UI && !scanning && bookPanel === "closed" && <TourOverlay />}
			{!scanning && reader === "open" && <ReaderOverlay />}
			{!scanning && bookMenu && (
				<BookEditMenu
					position={bookMenu.position}
					onArrange={arrangeBook}
					onEditDetails={editBookDetails}
					onClose={closeBookMenu}
				/>
			)}
		</div>
	);
}
