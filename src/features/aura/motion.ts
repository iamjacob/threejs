/** Shared with the carousel and the aura, outside React, so drags don't re-render. */
export const auraMotion = {
	vis: 0,
	scrolling: false,
	snap: true,
	reduced: false,
	frozenTime: undefined as number | undefined,
	/** True after a drag, so the following click doesn't also toggle focus. */
	dragMoved: false,
};

export const GLIDE_MS = 520;
export const BLOOM_S = 0.5;
/**
 * One stalled WebView frame cannot skip the whole crossfade. 30fps frames
 * (33ms) still advance in real time; only a hitch longer than this is clamped.
 */
export const MAX_FRAME_S = 0.1;
/** Incoming aura waits until the book is this close to centre, in carousel units. */
export const SETTLED_DISTANCE = 0.75;

export function smoothstep(k: number) {
	return k * k * (3 - 2 * k);
}

export function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export function easeInOutCubic(k: number) {
	return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
}
