import { frameDelta } from "./journey.ts";

/** How long a committed scroll takes to fly from the outro into the library. */
export const ARRIVAL_SECONDS = 2.35;

export type ArrivalState = {
	progress: number;
	committed: boolean;
	eye: [number, number, number] | null;
	look: [number, number, number] | null;
	tangent: [number, number, number] | null;
	fov: number;
	anchorPosition: [number, number, number] | null;
	anchorQuaternion: [number, number, number, number] | null;
};

export function createArrival(): ArrivalState {
	return {
		progress: 0,
		committed: false,
		eye: null,
		look: null,
		tangent: null,
		fov: 32,
		anchorPosition: null,
		anchorQuaternion: null,
	};
}

export function resetArrival(state: ArrivalState) {
	const next = createArrival();
	state.progress = next.progress;
	state.committed = next.committed;
	state.eye = next.eye;
	state.look = next.look;
	state.tangent = next.tangent;
	state.fov = next.fov;
	state.anchorPosition = next.anchorPosition;
	state.anchorQuaternion = next.anchorQuaternion;
}

/** The outro is the last beat of the journey. Further forward input leaves it. */
export function inputFeedsArrival(endShown: boolean, committed: boolean) {
	return endShown || committed;
}

/**
 * The first forward notch commits the flight. Later notches only nudge it.
 * Backward input is ignored, and reduced motion finishes on that same notch.
 */
export function commitArrival(
	state: ArrivalState,
	step: number,
	reduced: boolean,
) {
	if (!Number.isFinite(step) || step <= 0) return;
	state.committed = true;
	if (reduced) {
		state.progress = 1;
		return;
	}
	state.progress = Math.min(1, state.progress + Math.min(0.12, step * 2));
}

export function stepArrival(state: ArrivalState, rawDelta: number) {
	if (!state.committed || state.progress >= 1) return;
	const delta = frameDelta(rawDelta);
	state.progress = Math.min(1, state.progress + delta / ARRIVAL_SECONDS);
}

export function smootherstep01(value: number) {
	const t = Math.min(1, Math.max(0, value));
	return t * t * t * (t * (t * 6 - 15) + 10);
}
