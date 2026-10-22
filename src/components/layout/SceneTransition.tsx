import { useRouter } from "@tanstack/react-router";
import {
	type CSSProperties,
	useEffect,
	useRef,
	useSyncExternalStore,
} from "react";
import {
	type ScenePath,
	sceneTransition,
	type TransitionState,
} from "../../stores/sceneTransition";
import LoaderMark from "./LoaderMark";

const subscribe = (fn: () => void) => sceneTransition.store.subscribe(fn);
const snapshot = () => sceneTransition.store.getState();

/** Where the iris starts: the last pointer press (the joystick menu button), else the center. */
const origin = { x: "50%", y: "50%" };
if (typeof window !== "undefined")
	window.addEventListener(
		"pointerdown",
		(e) => {
			origin.x = `${e.clientX}px`;
			origin.y = `${e.clientY}px`;
		},
		{ capture: true, passive: true },
	);

const LABEL: Record<ScenePath, string> = {
	"/": "Opening your shelves",
	"/play": "Opening the map",
};

/**
 * Root-level overlay for shelves ⇄ map. Mounted once in __root so it survives the route change:
 * it covers the old scene, stays (with the back-and-forth loader) while the new one boots, and
 * fades out when the destination calls `sceneTransition.arrive`.
 */
export default function SceneTransition() {
	const router = useRouter();
	const state: TransitionState = useSyncExternalStore(
		subscribe,
		snapshot,
		snapshot,
	);
	const iris = useRef<CSSProperties>({});

	useEffect(
		() =>
			sceneTransition.setNavigator(
				(to) => router.navigate({ to }),
				(to) => router.preloadRoute({ to }),
			),
		[router],
	);

	if (state.phase === "cover")
		iris.current = { "--ix": origin.x, "--iy": origin.y } as CSSProperties;
	if (state.phase === "idle" || !state.to) return null;
	return (
		<output
			className="scene-transition"
			data-testid="scene-transition"
			data-phase={state.phase}
			style={iris.current}
			aria-live="polite"
			aria-label={LABEL[state.to]}
		>
			<LoaderMark className="scene-transition-mark" />
		</output>
	);
}

/** Destination routes call this once their scene is visible (no-op outside a transition). */
export function useArriveWhen(path: ScenePath, ready: boolean) {
	useEffect(() => {
		if (ready) sceneTransition.arrive(path);
	}, [path, ready]);
}
