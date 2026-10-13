import { Plus, Sparkles, SquarePen } from "lucide-react";
import { Canvas } from "@react-three/fiber";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useRef, useState } from "react";
import { useShelfControlsStore } from "../../stores/useShelfControlsStore";
import Header from "../components/layout/header/header";
import SceneToolbar from "../components/layout/SceneToolbar";
import SceneEnvironment from "../components/layout/SceneEnvironment";
import ShelfControls from "../components/layout/ShelfControls";
import Lightning from "../components/lightning/Lightning";
import BookScanner from "../components/scanner/BookScanner";
import {
	loadScannedBooks,
	saveScannedBook,
	scannedBook,
	type BookScan,
} from "../components/scanner/scannedBook";
import TourCamera from "../components/tour/TourCamera";
import TourDirector from "../components/tour/TourDirector";
import TourOverlay from "../components/tour/TourOverlay";
import TourScene from "../components/tour/TourScene";
import { SHOW_DEMO_UI } from "../lib/featureFlags";
import { useBookStore, useSelectedBook } from "../stores/useBookStore";
import { useTourStore } from "../stores/useTourStore";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const [scanning, setScanning] = useState(true);
	const [notice, setNotice] = useState("");
	const stage = useTourStore((state) => state.stage);
	const adding = useTourStore((state) => state.userAddition);
	const wasAdding = useRef(false);
	const book = useSelectedBook();
	const editing = useShelfControlsStore((state) => state.editing);
	const editableStage = stage === "library" || stage === "pick";
	const showShelfControls = !scanning && editing && editableStage;
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
	}, [editableStage]);
	useEffect(() => {
		if (!notice) return;
		const timer = window.setTimeout(() => setNotice(""), 6000);
		return () => window.clearTimeout(timer);
	}, [notice]);
	const closeScanner = () => {
		setScanning(false);
		useTourStore.setState({ paused: !SHOW_DEMO_UI });
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
			{SHOW_DEMO_UI && !scanning && !showShelfControls && (
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
					className="library-actions"
					style={SHOW_DEMO_UI ? { top: 76 } : undefined}
				>
					<button
						type="button"
						title="Hold a book to edit, or edit the selected book here"
						onClick={() => {
							const editor = useShelfControlsStore.getState();
							const selected = useBookStore.getState().selectedBookId;
							const id = editor.document.items[selected]
								? selected
								: editor.document.order[0];
							if (id) {
								useTourStore.setState({ paused: true });
								editor.openBookEditor(id);
							}
						}}
					>
						<SquarePen size={16} /> Edit book
					</button>
					<button
						type="button"
						onClick={() => {
							useTourStore.setState({ paused: true });
							setNotice("");
							setScanning(true);
						}}
					>
						<Plus size={17} /> Scan a book
					</button>
				</div>
			)}
			{!scanning && adding && (
				<output className="library-add-status">
					<Sparkles size={16} />
					<span>Bringing “{book.title}” to your shelf</span>
				</output>
			)}
			{!scanning && notice && (
				<output className="library-notice">{notice}</output>
			)}
			<div
				className="fixed inset-0"
				data-scene={stage}
				inert={scanning}
				aria-hidden={scanning}
			>
				<Canvas
					frameloop={scanning ? "never" : "always"}
					shadows="percentage"
					gl={{ alpha: true }}
					onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
					camera={{ position: [0, 4, 8], fov: 45, near: 0.01, far: 500 }}
				>
					<Suspense fallback={null}>
						<SceneEnvironment />
						<TourScene />
					</Suspense>
					<TourCamera />
					<TourDirector />
					<Lightning />
				</Canvas>
			</div>
			{SHOW_DEMO_UI && !scanning && <TourOverlay />}
		</div>
	);
}
