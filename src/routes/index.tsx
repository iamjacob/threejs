import { Canvas } from "@react-three/fiber";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import AboutBoooks from "../components/layout/AboutBoooks";
import Header from "../components/layout/header/header";
import SceneToolbar from "../components/layout/SceneToolbar";
import SceneEnvironment from "../components/layout/SceneEnvironment";
import Lightning from "../components/lightning/Lightning";
import TourCamera from "../components/tour/TourCamera";
import TourDirector from "../components/tour/TourDirector";
import TourOverlay from "../components/tour/TourOverlay";
import TourScene from "../components/tour/TourScene";
import { useTourStore } from "../stores/useTourStore";

export const Route = createFileRoute("/")({ component: Home });

const SHOW_INTRODUCTION = false;
const SHOW_HEADER = true;

function Home() {
	const [started, setStarted] = useState(!SHOW_INTRODUCTION);
	const stage = useTourStore((state) => state.stage);
	const start = () => {
		if (started) return;
		useTourStore.getState().start();
		setStarted(true);
	};
	useEffect(() => {
		if (!SHOW_INTRODUCTION) useTourStore.getState().start();
	}, []);
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
	return (
		<div
			className="fixed inset-0 bg-[#080d1a]"
		>
			{SHOW_HEADER && (
				<Header showBrand={false}>
					{started && (
						<SceneToolbar
							showBlur={false}
							showBook={false}
							showLighting={false}
						/>
					)}
				</Header>
			)}
			{SHOW_INTRODUCTION && (
				<AboutBoooks isOpen={!started} onClose={start} onExplore={start} />
			)}
			{started && (
				<>
					<div className="fixed inset-0" data-scene={stage}>
						<Canvas
							shadows="percentage"
							gl={{ alpha: true }}
							onCreated={({ gl }) => {
								gl.setClearColor(0x000000, 0);
							}}
							camera={{ position: [0, 4, 8], fov: 45, near: 0.01, far: 500 }}
						>
							<Suspense fallback={null}>
								<SceneEnvironment />
								<TourScene />
							</Suspense>
							<TourCamera />
							<TourDirector />
							<Lightning shelves={shelves} />
						</Canvas>
					</div>
					<TourOverlay />
				</>
			)}
		</div>
	);
}
