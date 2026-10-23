import { createStore } from "zustand/vanilla";

/**
 * Cross-route world transition (shelves "/" ⇄ Maps "/maps").
 *
 * idle → cover (overlay irises in) → wait (route has changed; waiting for the destination to call
 * `arrive`) → reveal (overlay fades out) → idle.
 *
 * Failure paths never silently reveal an unready scene:
 * - wait exceeds maxWaitMs → "slow": the overlay stays, with "Keep waiting" / "Show anyway".
 *   A late `arrive` still reveals normally.
 * - navigate rejects → "failed": "Try again" / "Close". (A route that errors while loading shows
 *   the root error page instead, which calls `cancel`.)
 * - the browser history moves mid-transition (Back/Forward) → `cancel`: the overlay is dropped
 *   at once, so it never swallows Back.
 * Kept free of React/router imports so it runs under `node --test`; the root layout registers the
 * router's navigate/preload with `setNavigator`.
 */
export type ScenePath = "/" | "/maps";
export type TransitionPhase =
	| "idle"
	| "cover"
	| "wait"
	| "slow"
	| "failed"
	| "reveal";
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
/** After this long without `arrive`, the overlay offers "Keep waiting" / "Show anyway". */
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

	/** Enters "wait"; if `arrive` has not come after maxWaitMs, becomes "slow" (overlay stays). */
	const armWait = (id: number) => {
		store.setState({ phase: "wait" });
		later(() => {
			if (current(id) && store.getState().phase === "wait")
				store.setState({ phase: "slow" });
		}, maxWaitMs);
	};
	/** Navigates under the cover and waits for `arrive`. */
	const waitFor = (id: number, to: ScenePath) => {
		armWait(id);
		void Promise.resolve()
			.then(() => navigate?.(to))
			.catch(() => {
				if (!current(id)) return;
				timers.clear(timer);
				store.setState({ phase: "failed" });
			});
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
				if (current(id)) waitFor(id, to);
			}, coverMs);
			return true;
		},
		/** Called by a route once its scene is ready to be seen (also accepted late, while "slow"). */
		arrive(path: ScenePath) {
			const { phase, to, id } = store.getState();
			if ((phase === "wait" || phase === "slow") && to === path) reveal(id);
		},
		/** "Keep waiting" (from slow) or "Try again" (from failed). */
		retry() {
			const { phase, to, id } = store.getState();
			if (phase === "slow") armWait(id);
			else if (phase === "failed" && to) waitFor(id, to);
		},
		/** "Show anyway" (slow) or "Close" (failed): the user chose to see the page as it is. */
		dismiss() {
			const { phase, id } = store.getState();
			if (phase === "slow" || phase === "failed") reveal(id);
		},
		/**
		 * Drops the overlay at once (browser Back/Forward mid-transition, or a route error page that
		 * must be visible). Bumps the id so pending timers and navigations become stale.
		 */
		cancel() {
			const { phase, id } = store.getState();
			if (phase === "idle") return;
			timers.clear(timer);
			store.setState({ phase: "idle", to: undefined, id: id + 1 });
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
