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
	"/maps": "Opening Maps",
};
const NAME: Record<ScenePath, string> = {
	"/": "Your shelves",
	"/maps": "Maps",
};

/**
 * Root-level overlay for shelves ⇄ Maps. Mounted once in __root so it survives the route change:
 * it covers the old scene, stays (with the back-and-forth loader) while the new one boots, and
 * fades out when the destination calls `sceneTransition.arrive`. If the destination is slow or
 * the navigation fails it stays up and offers explicit, focusable choices instead of revealing a
 * blank scene. Browser Back/Forward during a transition cancels it.
 */
export default function SceneTransition() {
	const router = useRouter();
	const state: TransitionState = useSyncExternalStore(
		subscribe,
		snapshot,
		snapshot,
	);
	const iris = useRef<CSSProperties>({});
	const firstAction = useRef<HTMLButtonElement>(null);

	useEffect(
		() =>
			// A route that errors while loading renders the root error page, which cancels the cover
			// itself (see RouteError); a rejected navigate shows the "failed" panel below.
			sceneTransition.setNavigator(
				(to) => router.navigate({ to }),
				(to) => router.preloadRoute({ to }),
			),
		[router],
	);
	// Back/Forward (popstate) while covered: never swallow it behind the overlay.
	useEffect(
		() =>
			router.history.subscribe(({ action }) => {
				if (
					action.type === "BACK" ||
					action.type === "FORWARD" ||
					action.type === "GO"
				)
					sceneTransition.cancel();
			}),
		[router],
	);

	const blocked = state.phase === "slow" || state.phase === "failed";
	useEffect(() => {
		if (blocked) firstAction.current?.focus();
	}, [blocked]);

	if (state.phase === "cover")
		iris.current = { "--ix": origin.x, "--iy": origin.y } as CSSProperties;
	if (state.phase === "idle" || !state.to) return null;
	if (blocked)
		return (
			<div
				className="scene-transition"
				data-testid="scene-transition"
				data-phase={state.phase}
				role="alertdialog"
				aria-modal="false"
				aria-labelledby="scene-transition-title"
			>
				<div className="scene-transition-panel">
					<LoaderMark className="scene-transition-mark-static" />
					<p id="scene-transition-title" className="scene-transition-title">
						{state.phase === "slow"
							? `${NAME[state.to]} is taking longer than usual.`
							: `${NAME[state.to]} could not be opened.`}
					</p>
					<div className="scene-transition-actions">
						<button
							ref={firstAction}
							type="button"
							data-testid="scene-transition-retry"
							onClick={() => sceneTransition.retry()}
						>
							{state.phase === "slow" ? "Keep waiting" : "Try again"}
						</button>
						<button
							type="button"
							data-testid="scene-transition-dismiss"
							onClick={() => sceneTransition.dismiss()}
						>
							{state.phase === "slow" ? "Show anyway" : "Close"}
						</button>
					</div>
				</div>
			</div>
		);
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
