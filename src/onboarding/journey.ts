/**
 * Scroll clock for the onboarding journey.
 *
 * The prototype lerped the camera with an unclamped frame delta (`alpha = delta * friction`).
 * On a slow frame that alpha exceeded 1, so one wheel notch — amplified by the 1444-mesh
 * hitch — could cross the whole curve. Input is capped per notch and per second, and
 * integration never consumes more than one 30fps frame.
 */

export const JOURNEY_SECONDS = 46;

/** One 100px notch. Beats are ~0.18 apart, so a notch cannot skip a card. */
export const MAX_INPUT_STEP = 0.034;

/** A flurry of notches still cannot finish the journey in a couple of seconds. */
export const MAX_PROGRESS_PER_SECOND = 0.11;

export const END_SHOW = 0.93;
export const END_HIDE = 0.885;

/** Stay short of the curve tip so the camera still looks through the last rings. */
export const JOURNEY_LIMIT = 0.97;

export type BeatId =
	| "welcome"
	| "current-book"
	| "reading-rhythm"
	| "reader-identity"
	| "complete";

export type Beat = {
	id: BeatId;
	t: number;
	side: number;
	icon: string;
	label: string;
	title: string;
	description: string;
	type: "info" | "input" | "choice";
	placeholder?: string;
	primaryLabel?: string;
	options?: readonly string[];
};

export const BEATS: readonly Beat[] = [
	{
		id: "welcome",
		t: 0.14,
		side: -1,
		icon: "BOOKS",
		label: "Welcome to Boooks",
		title: "Reading is more than something you finish.",
		description:
			"It is a habit you return to and an identity you slowly build.",
		type: "info",
		primaryLabel: "Let's begin",
	},
	{
		id: "current-book",
		t: 0.32,
		side: 1,
		icon: "READ",
		label: "Right now",
		title: "What are you reading?",
		description:
			"Add the book currently holding your attention. You can always change it later.",
		type: "input",
		placeholder: "Book title",
		primaryLabel: "Continue",
	},
	{
		id: "reading-rhythm",
		t: 0.5,
		side: -1,
		icon: "TIME",
		label: "Your rhythm",
		title: "When does reading fit most naturally?",
		description:
			"There is no perfect schedule. Choose the rhythm that feels most like you.",
		type: "choice",
		options: ["In quiet moments", "At a set time"],
	},
	{
		id: "reader-identity",
		t: 0.68,
		side: 1,
		icon: "GROW",
		label: "Your identity",
		title: "What kind of reader are you becoming?",
		description:
			"Your answer does not have to describe you yet. It can describe where you are going.",
		type: "choice",
		options: ["Consistent", "Curious"],
	},
	{
		id: "complete",
		t: 0.84,
		side: -1,
		icon: "DONE",
		label: "You're ready",
		title: "A few pages still count.",
		description:
			"You do not have to read perfectly to be a reader. You only have to return.",
		type: "info",
		primaryLabel: "Start reading",
	},
];

export type JourneyState = {
	target: number;
	display: number;
	pending: number;
};

export function createJourney(): JourneyState {
	return { target: 0, display: 0, pending: 0 };
}

export function clamp01(value: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

/** A stalled frame must not teleport the camera. Two seconds of jank becomes one 30fps step. */
export function frameDelta(raw: number) {
	if (!Number.isFinite(raw) || raw <= 0) return 0;
	return Math.min(raw, 1 / 30);
}

export function damp(
	current: number,
	target: number,
	lambda: number,
	delta: number,
) {
	if (!(delta > 0) || !Number.isFinite(current) || !Number.isFinite(target)) {
		return Number.isFinite(current) ? current : 0;
	}
	const alpha = 1 - Math.exp(-lambda * delta);
	return current + (target - current) * alpha;
}

/** Normalize wheel deltas so accelerated mice and page-mode wheels still count as one notch. */
export function wheelStep(deltaY: number, deltaMode = 0) {
	if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
	const pixels =
		deltaMode === 1
			? deltaY * 16
			: deltaMode === 2
				? Math.sign(deltaY) * 100
				: deltaY;
	const notches = pixels / 100;
	if (Math.abs(notches) >= 1) return Math.sign(notches) * MAX_INPUT_STEP;
	return notches * MAX_INPUT_STEP;
}

export function touchStep(pixels: number) {
	return wheelStep(pixels, 0);
}

export function frictionAt(progress: number) {
	let friction = 1;
	for (const beat of BEATS) {
		const distance = Math.abs(progress - beat.t);
		const zone = 0.055;
		if (distance < zone) {
			friction = Math.min(friction, 0.32 + 0.68 * (distance / zone));
		}
	}
	return friction;
}

export function beatAt(progress: number, window = 0.05): Beat | null {
	let best: Beat | null = null;
	let bestDistance = window;
	for (const beat of BEATS) {
		const distance = Math.abs(progress - beat.t);
		if (distance <= bestDistance) {
			best = beat;
			bestDistance = distance;
		}
	}
	return best;
}

/** The next stop ahead. The journey never rewinds, so there is no previous station. */
export function nextStation(progress: number) {
	// The last stop is short of the curve tip. The outro fades in at END_SHOW,
	// which a glide aimed exactly at that threshold never quite reaches.
	const stations = [...BEATS.map((beat) => beat.t), JOURNEY_LIMIT];
	return stations.find((t) => t > progress + 0.012) ?? JOURNEY_LIMIT;
}

export function queueStep(state: JourneyState, step: number) {
	if (!Number.isFinite(step) || step <= 0) return;
	state.pending += step;
}

export function glideTo(state: JourneyState, progress: number) {
	state.pending = 0;
	state.target = Math.min(JOURNEY_LIMIT, clamp01(progress));
}

export function stepJourney(
	state: JourneyState,
	rawDelta: number,
	options: { reduced: boolean; audioProgress: number | null },
) {
	const delta = frameDelta(rawDelta);
	if (state.pending < 0) state.pending = 0;
	state.target = Math.min(JOURNEY_LIMIT, Math.max(state.target, state.display));
	if (options.audioProgress != null && !options.reduced) {
		// The soundtrack is the master clock. Pending scroll was already applied as a seek.
		const audioTarget = Math.min(JOURNEY_LIMIT, clamp01(options.audioProgress));
		if (audioTarget >= state.display) state.target = audioTarget;
	} else if (options.reduced) {
		state.target = Math.min(
			JOURNEY_LIMIT,
			clamp01(state.target + state.pending),
		);
		state.pending = 0;
		state.display = Math.max(state.display, state.target);
		return state;
	} else {
		const budget = MAX_PROGRESS_PER_SECOND * frictionAt(state.display) * delta;
		const applied = Math.min(state.pending, budget);
		state.pending -= applied;
		state.target = Math.min(JOURNEY_LIMIT, clamp01(state.target + applied));
	}
	state.display = Math.max(
		state.display,
		Math.min(
			JOURNEY_LIMIT,
			clamp01(damp(state.display, state.target, 3.4, delta)),
		),
	);
	return state;
}

export function endVisible(display: number, currently: boolean) {
	if (currently) return display >= END_HIDE;
	return display >= END_SHOW;
}

/**
 * The prototype left "Scroll to begin your journey" on screen for the whole flight,
 * so it sat on top of the cards. The hint exists only in the gaps between cards.
 */
export function showScrollHint(
	phase: "intro" | "journey",
	cardVisible: boolean,
	end: boolean,
) {
	return phase === "journey" && !cardVisible && !end;
}

export function trackProgress(currentTime: number, duration: number) {
	if (!Number.isFinite(duration) || duration <= 0.05) return null;
	if (!Number.isFinite(currentTime) || currentTime < 0) return null;
	return clamp01(currentTime / duration);
}

export function soundtrackDrives(
	paused: boolean,
	ended: boolean,
	duration: number,
	reduced: boolean,
) {
	return (
		!reduced &&
		!paused &&
		!ended &&
		Number.isFinite(duration) &&
		duration > 0.05
	);
}

/** Full-curve ring count. The prototype hardcoded 1444 separate meshes and ignored spacing. */
export function ringCount(curveLength: number, spacing = 12) {
	if (!Number.isFinite(curveLength) || curveLength <= 0) return 18;
	return Math.min(80, Math.max(18, Math.round(curveLength / spacing)));
}

export function closestPlaneDistance(
	eye: readonly [number, number, number],
	rings: readonly {
		position: readonly [number, number, number];
		tangent: readonly [number, number, number];
	}[],
) {
	let min = Number.POSITIVE_INFINITY;
	for (const ring of rings) {
		const along = Math.abs(
			(eye[0] - ring.position[0]) * ring.tangent[0] +
				(eye[1] - ring.position[1]) * ring.tangent[1] +
				(eye[2] - ring.position[2]) * ring.tangent[2],
		);
		if (along < min) min = along;
	}
	return min;
}

/**
 * The prototype rings stayed axis-aligned while the path bent, so the camera
 * flew into a ring face and half the view became a wood wall. Rings now face
 * the tangent. The eye still steps backward until it sits between those planes.
 */
export function eyeBackoff(
	point: readonly [number, number, number],
	tangent: readonly [number, number, number],
	rings: readonly {
		position: readonly [number, number, number];
		tangent: readonly [number, number, number];
	}[],
	minClearance = 1.35,
) {
	const at = (back: number): [number, number, number] => [
		point[0] - tangent[0] * back,
		point[1] - tangent[1] * back,
		point[2] - tangent[2] * back,
	];
	for (let back = 2.4; back <= 12; back += 0.4) {
		if (
			rings.length === 0 ||
			closestPlaneDistance(at(back), rings) >= minClearance
		) {
			return back;
		}
	}
	return 12;
}

export type SkyStop = { t: number; top: string; bottom: string };

export const SKY: readonly SkyStop[] = [
	{ t: 0, top: "#101828", bottom: "#c5c4e0" },
	{ t: 0.34, top: "#5b2d96", bottom: "#ffb15a" },
	{ t: 0.62, top: "#3a342c", bottom: "#f0c56a" },
	{ t: 0.82, top: "#24182f", bottom: "#8eb8aa" },
	{ t: 1, top: "#101828", bottom: "#b7b6d4" },
];

export function skyAt(progress: number) {
	const t = clamp01(progress);
	let index = 0;
	while (index < SKY.length - 2 && SKY[index + 1].t < t) index += 1;
	const from = SKY[index];
	const to = SKY[index + 1];
	const span = to.t - from.t || 1;
	return { from, to, local: (t - from.t) / span };
}
