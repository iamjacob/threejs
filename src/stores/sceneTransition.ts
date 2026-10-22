import { createStore } from "zustand/vanilla";

/**
 * Cross-route scene transition (shelves "/" ⇄ map "/play").
 *
 * idle → cover (overlay fades/irises in) → wait (route has changed; waiting for the destination to
 * call `arrive`, capped by maxWaitMs so it can never get stuck) → reveal (overlay fades out) → idle.
 * Kept free of React/router imports so it runs under `node --test`; the root layout registers the
 * router's navigate/preload with `setNavigator`.
 */
export type ScenePath = "/" | "/play";
export type TransitionPhase = "idle" | "cover" | "wait" | "reveal";
export type TransitionState = {
	phase: TransitionPhase;
	to?: ScenePath;
	/** Increments per transition; stale timers compare against it. */
	id: number;
};

type Handle = unknown;
export type TransitionTimers = {
	set: (fn: () => void, ms: number) => Handle;
	clear: (handle: Handle) => void;
};
export type TransitionOptions = {
	coverMs?: number;
	revealMs?: number;
	maxWaitMs?: number;
	timers?: TransitionTimers;
};

export const COVER_MS = 320;
export const REVEAL_MS = 480;
export const MAX_WAIT_MS = 10_000;

const realTimers: TransitionTimers = {
	set: (fn, ms) => setTimeout(fn, ms),
	clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function createSceneTransition({
	coverMs = COVER_MS,
	revealMs = REVEAL_MS,
	maxWaitMs = MAX_WAIT_MS,
	timers = realTimers,
}: TransitionOptions = {}) {
	const store = createStore<TransitionState>(() => ({ phase: "idle", id: 0 }));
	let navigate: ((to: ScenePath) => unknown) | undefined;
	let preload: ((to: ScenePath) => unknown) | undefined;
	let timer: Handle;
	const later = (fn: () => void, ms: number) => {
		timers.clear(timer);
		timer = timers.set(fn, ms);
	};
	const current = (id: number) => store.getState().id === id;

	const reveal = (id: number) => {
		const { phase } = store.getState();
		if (!current(id) || phase === "idle" || phase === "reveal") return;
		store.setState({ phase: "reveal" });
		later(() => {
			if (current(id)) store.setState({ phase: "idle", to: undefined });
		}, revealMs);
	};

	return {
		store,
		/** Registered once by the root layout. Returns an unregister function. */
		setNavigator(
			nav: (to: ScenePath) => unknown,
			pre?: (to: ScenePath) => unknown,
		) {
			navigate = nav;
			preload = pre;
			return () => {
				if (navigate !== nav) return;
				navigate = undefined;
				preload = undefined;
			};
		},
		/** Starts a transition. Ignored (false) while one is running or before the router is ready. */
		go(to: ScenePath): boolean {
			const state = store.getState();
			if (state.phase !== "idle" || !navigate) return false;
			const id = state.id + 1;
			store.setState({ phase: "cover", to, id });
			// Fetch the destination's code while the overlay covers the screen.
			void Promise.resolve()
				.then(() => preload?.(to))
				.catch(() => {});
			later(() => {
				if (!current(id)) return;
				store.setState({ phase: "wait" });
				later(() => reveal(id), maxWaitMs);
				void Promise.resolve()
					.then(() => navigate?.(to))
					.catch(() => reveal(id));
			}, coverMs);
			return true;
		},
		/** Called by a route once its scene is ready to be seen. */
		arrive(path: ScenePath) {
			const { phase, to, id } = store.getState();
			if (phase === "wait" && to === path) reveal(id);
		},
	};
}

const reducedMotion =
	typeof window !== "undefined" &&
	typeof window.matchMedia === "function" &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The app-wide instance. Reduced motion skips the cover animation time. */
export const sceneTransition = createSceneTransition(
	reducedMotion ? { coverMs: 0, revealMs: 120 } : {},
);
