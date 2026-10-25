import { timelineDelta } from "./journey.ts";

/**
 * The original ending, from Experience.jsx.
 * When the camera passes the last curve point by 100 units, scroll stops,
 * planeOutTl lifts the camera rail by 12 over 8 seconds (GSAP's default
 * power1.out, which is linear), and the loop fades. The library glide starts
 * only after that lift, from the raised forward-looking pose.
 */
export const FALLOFF_SECONDS = 8;
export const FALLOFF_LIFT = 12;
export const FALLOFF_Z_MARGIN = 100;

export type FalloffState = {
	active: boolean;
	elapsed: number;
	eye: [number, number, number] | null;
	tangent: [number, number, number] | null;
	fov: number;
};

export function createFalloff(): FalloffState {
	return { active: false, elapsed: 0, eye: null, tangent: null, fov: 32 };
}

export function resetFalloff(state: FalloffState) {
	const next = createFalloff();
	state.active = next.active;
	state.elapsed = next.elapsed;
	state.eye = next.eye;
	state.tangent = next.tangent;
	state.fov = next.fov;
}

/** camera.z < lastCurvePoint.z + 100 in the prototype. */
export function falloffReady(cameraZ: number, endZ: number) {
	return cameraZ < endZ + FALLOFF_Z_MARGIN;
}

export function beginFalloff(
	state: FalloffState,
	eye: readonly [number, number, number],
	tangent: readonly [number, number, number],
	fov: number,
) {
	if (state.active) return;
	state.active = true;
	state.elapsed = 0;
	state.eye = [eye[0], eye[1], eye[2]];
	state.tangent = [tangent[0], tangent[1], tangent[2]];
	state.fov = fov;
}

export function stepFalloff(
	state: FalloffState,
	rawDelta: number,
	reduced: boolean,
) {
	if (!state.active) return;
	if (reduced) {
		state.elapsed = FALLOFF_SECONDS;
		return;
	}
	state.elapsed = Math.min(
		FALLOFF_SECONDS,
		state.elapsed + timelineDelta(rawDelta),
	);
}

/** power1.out over 8 seconds. power 1 is linear. */
export function falloffLift(elapsed: number) {
	const t = Math.min(1, Math.max(0, elapsed / FALLOFF_SECONDS));
	return FALLOFF_LIFT * t;
}

/**
 * The prototype lerps the loop opacity toward 0 by the frame delta, which is
 * the same curve as exp(-elapsed).
 */
export function falloffOpacity(elapsed: number) {
	if (!Number.isFinite(elapsed) || elapsed <= 0) return 1;
	return Math.exp(-elapsed);
}

export function falloffHandsOff(state: FalloffState) {
	return state.active && state.elapsed >= FALLOFF_SECONDS;
}
