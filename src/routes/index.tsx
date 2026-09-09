import { Stars } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import AboutBoooks from "../components/layout/AboutBoooks";
import BookCarousel from "../components/layout/BookCarousel";
import DemoCamera from "../components/layout/DemoCamera";
import {
	type DemoId,
	getDemoScene,
	isDemoId,
} from "../components/layout/demoScenes";
import Header from "../components/layout/header/header";
import SceneToolbar from "../components/layout/SceneToolbar";
import TocSidebar from "../components/layout/TocSidebar";
import Lightning from "../components/lightning/Lightning";
import { shelfBooks } from "../components/shelves/Bookshelves";
import { useSelectedBook } from "../stores/useBookStore";
import { useLevelStore } from "../stores/useLevelStore";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const [activeId, setActiveId] = useState<DemoId | "Boooks" | "ChooseBook">(
		"Boooks",
	);
	const [sceneId, setSceneId] = useState<DemoId>("3DBook");
	const [isAboutOpen, setIsAboutOpen] = useState(true);
	const [isBookPickerOpen, setIsBookPickerOpen] = useState(false);
	const [hasChosenBook, setHasChosenBook] = useState(false);
	const selectedBook = useSelectedBook();
	const { Scene, Controller, camera } = getDemoScene(sceneId);
	const background =
		"radial-gradient(ellipse at 15% 20%, #1f2146 0%, transparent 55%), radial-gradient(ellipse at 85% 85%, #083746 0%, transparent 55%), #080d1a";

	const selectDemo = (id: string) => {
		if (id === "ChooseBook") {
			setIsBookPickerOpen(true);
			return;
		}
		if (id === "Boooks") {
			setActiveId(id);
			setIsAboutOpen(true);
			return;
		}
		if (!isDemoId(id)) return;
		const demo = getDemoScene(id);
		if (demo.shelfLevel !== undefined) {
			useLevelStore.getState().startDemo(demo.shelfLevel, demo.autoplay);
		} else {
			useLevelStore.getState().pausePlayback();
		}
		setActiveId(id);
		setSceneId(id);
		setIsAboutOpen(false);
	};

	return (
		<div className="fixed inset-0 bg-blue-900" style={{ background }}>
			<Header />
			{hasChosenBook && (
				<TocSidebar activeId={activeId} onSelect={selectDemo} />
			)}
			<BookCarousel
				isOpen={isBookPickerOpen}
				firstChoice={!hasChosenBook}
				onClose={() => setIsBookPickerOpen(false)}
				onChoose={() => {
					setIsBookPickerOpen(false);
					if (!hasChosenBook) selectDemo("3DBook");
					setHasChosenBook(true);
				}}
			/>
			<AboutBoooks
				isOpen={isAboutOpen}
				onClose={() => {
					setIsAboutOpen(false);
					if (!hasChosenBook) setIsBookPickerOpen(true);
				}}
				onExplore={() => {
					setIsAboutOpen(false);
					setIsBookPickerOpen(true);
				}}
			/>
			<div
				className={`fixed inset-x-0 top-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-0 bg-blue-900 md:bottom-0 ${sceneId === "mobile-books" ? "mobile-books-preview" : ""}`}
				style={{ top: "env(safe-area-inset-top)", background }}
				data-scene={sceneId}
			>
				{hasChosenBook && (
					<Canvas
						camera={{ position: [0, 4, 8], fov: 45, near: 0.01, far: 500 }}
					>
						<Suspense fallback={null}>
							<Scene key={`${sceneId}-${selectedBook.id}`} />
						</Suspense>
						<DemoCamera key={`${sceneId}-${selectedBook.id}`} view={camera} />
						<Lightning />
						<Stars count={2200} factor={2} fade speed={0.3} />
					</Canvas>
				)}
				{hasChosenBook && Controller && (
					<Controller key={`${sceneId}-${selectedBook.id}`} />
				)}
				{sceneId === "mobile-books" && (
					<div className="books-caption pointer-events-none absolute inset-x-0 bottom-5 text-center text-white/70">
						<p className="text-sm font-medium">
							{shelfBooks.length} books · Level 4
						</p>
						<p className="mt-1 text-xs text-white/40">
							Drag to explore · Pinch to zoom
						</p>
					</div>
				)}
				{hasChosenBook && (
					<SceneToolbar
						activeId={activeId}
						showBlur={sceneId === "Blur"}
						onChangeBook={() => setIsBookPickerOpen(true)}
					/>
				)}
			</div>
		</div>
	);
}
