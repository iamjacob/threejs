import { Canvas } from "@react-three/fiber";
import { lazy, Suspense, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useShelfControlsStore } from "../../stores/useShelfControlsStore";
import { hydrateInitialLibrary } from "../lib/hydrateInitialLibrary";
import { currentRenderQuality } from "../lib/renderQuality";
import { useBookStore } from "../stores/useBookStore";
import { useTourStore } from "../stores/useTourStore";
import OnboardingScene from "./scene";
import { libraryHostHandlers, resetJourneySession } from "./session";

const LibraryBridge = lazy(() => import("./libraryBridge"));

export type StageAnswers = { rhythm: string; identity: string };

type StageSnapshot = {
	mode: "journey" | "library";
	active: boolean;
	preload: boolean;
	answers: StageAnswers;
	paused: boolean;
	showStats: boolean;
};

const listeners = new Set<() => void>();

function initialSnapshot(): StageSnapshot {
	return {
		mode: "journey",
		active: false,
		preload: false,
		answers: { rhythm: "", identity: "" },
		paused: false,
		showStats: false,
	};
}

let snapshot: StageSnapshot = initialSnapshot();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function subscribeStage(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getStage() {
	return snapshot;
}

export function stageOwnsLibrary() {
	return snapshot.active && snapshot.mode === "library";
}

export function stageElement() {
	return host;
}

function publish(next: Partial<StageSnapshot>) {
	snapshot = {
		...snapshot,
		...next,
		answers: next.answers ?? snapshot.answers,
	};
	if (host) host.dataset.mode = snapshot.mode;
	for (const listener of listeners) listener();
}

export function setStageAnswers(answers: StageAnswers) {
	if (
		snapshot.answers.rhythm === answers.rhythm &&
		snapshot.answers.identity === answers.identity
	) {
		return;
	}
	publish({ answers });
}

export function requestLibraryPreload() {
	if (snapshot.preload || snapshot.mode === "library") return;
	const shelf = useShelfControlsStore.getState();
	if (!shelf.initialized) shelf.initialize(useBookStore.getState().books);
	void hydrateInitialLibrary();
	useTourStore.setState({ paused: true });
	publish({ preload: true, active: true });
}

export function enterLibraryStage() {
	useTourStore.setState({ paused: true });
	publish({ mode: "library", active: true, preload: false, paused: false });
}

export function setLibraryHost(props: {
	paused: boolean;
	showStats: boolean;
	onScreenshot: () => void;
}) {
	libraryHostHandlers.onScreenshot = props.onScreenshot;
	if (
		snapshot.paused === props.paused &&
		snapshot.showStats === props.showStats
	) {
		return;
	}
	publish({ paused: props.paused, showStats: props.showStats });
}

function StageCanvas() {
	const stage = useSyncExternalStore(subscribeStage, getStage, getStage);
	const quality = currentRenderQuality();
	const showLibrary = stage.preload || stage.mode === "library";
	return (
		<Canvas
			frameloop={stage.paused ? "never" : "always"}
			shadows={quality.shadows ? "percentage" : false}
			dpr={quality.dpr}
			gl={{
				alpha: false,
				antialias: quality.tier === "high",
				powerPreference: "high-performance",
			}}
			camera={{ position: [0, 4, 8], fov: 45, near: 0.01, far: 500 }}
			onCreated={({ gl }) => gl.setClearColor("#101828")}
		>
			{stage.mode === "journey" ? (
				<OnboardingScene answers={stage.answers} />
			) : null}
			{showLibrary ? (
				<Suspense fallback={null}>
					<LibraryBridge />
				</Suspense>
			) : null}
		</Canvas>
	);
}

export function ensureStage() {
	if (host) return host;
	host = document.createElement("div");
	host.id = "boooks-stage";
	host.className = "onb-stage";
	host.dataset.testid = "boooks-stage";
	host.dataset.mode = snapshot.mode;
	host.style.position = "fixed";
	host.style.inset = "0";
	host.style.zIndex = "0";
	host.style.pointerEvents = "none";
	host.style.overflow = "hidden";
	document.body.appendChild(host);
	root = createRoot(host);
	root.render(<StageCanvas />);
	publish({ active: true });
	return host;
}

/** Park the canvas behind the onboarding overlay. */
export function adoptStageForJourney() {
	const node = ensureStage();
	document.body.appendChild(node);
	node.hidden = false;
	node.style.position = "fixed";
	node.style.inset = "0";
	node.style.zIndex = "0";
	node.style.pointerEvents = "none";
	if (snapshot.mode === "library") {
		resetJourneySession();
		publish({ mode: "journey", preload: false, paused: false });
	}
}

/** Drop the canvas into the home page without creating a second WebGL context. */
export function dockStage(slot: HTMLElement) {
	const node = stageElement();
	if (!node) return;
	slot.appendChild(node);
	node.hidden = false;
	node.style.position = "absolute";
	node.style.inset = "0";
	node.style.zIndex = "auto";
	node.style.pointerEvents = "auto";
}

export function parkStage() {
	const node = stageElement();
	if (!node) return;
	document.body.appendChild(node);
	node.hidden = true;
	node.style.pointerEvents = "none";
}

export function releaseStage() {
	snapshot = initialSnapshot();
	for (const listener of listeners) listener();
	root?.unmount();
	root = null;
	host?.remove();
	host = null;
}
