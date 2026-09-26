import { Stars } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import AboutBoooks from "../components/layout/AboutBoooks";
import Header from "../components/layout/header/header";
import SceneToolbar from "../components/layout/SceneToolbar";
import Lightning from "../components/lightning/Lightning";
import TourCamera from "../components/tour/TourCamera";
import TourDirector from "../components/tour/TourDirector";
import TourOverlay from "../components/tour/TourOverlay";
import TourScene from "../components/tour/TourScene";
import { useTourStore } from "../stores/useTourStore";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const [started, setStarted] = useState(false);
	const stage = useTourStore((state) => state.stage);
	const start = () => {
		if (started) return;
		useTourStore.getState().start();
		setStarted(true);
	};
	const shelves = [
		"library",
		"pick",
		"delete",
		"return",
		"grow",
		"privacy",
		"add",
		"end",
	].includes(stage);
	const background =
		"radial-gradient(ellipse at 15% 20%, #1f2146 0%, transparent 55%), radial-gradient(ellipse at 85% 85%, #083746 0%, transparent 55%), #080d1a";
	return (
		<div className="fixed inset-0" style={{ background }}>
			<Header>
				{started && (
					<SceneToolbar
						showBlur={false}
						onChangeBook={() => useTourStore.getState().enter("library")}
					/>
				)}
			</Header>
			<AboutBoooks isOpen={!started} onClose={start} onExplore={start} />
			{started && (
				<>
					<div className="fixed inset-0" data-scene={stage}>
						<Canvas
							shadows="percentage"
							camera={{ position: [0, 4, 8], fov: 45, near: 0.01, far: 500 }}
						>
							<Suspense fallback={null}>
								<TourScene />
							</Suspense>
							<TourCamera />
							<TourDirector />
							<Lightning shelves={shelves} />
							<Stars count={1800} factor={2} fade speed={0.3} />
						</Canvas>
					</div>
					<TourOverlay />
				</>
			)}
		</div>
	);
}
