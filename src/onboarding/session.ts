import { type ArrivalState, createArrival, resetArrival } from "./arrival";
import { createJourney, type JourneyState } from "./journey";

/**
 * Shared clock for the overlay and the canvas. The canvas lives outside the
 * route so it can survive the flight into the library; both sides read this.
 */
export const journeySession: {
	journey: JourneyState;
	arrival: ArrivalState;
	clock: { current: number };
	reduced: { current: boolean };
	phase: { current: "intro" | "journey" };
	audio: { current: HTMLAudioElement | null };
	onProgress: (display: number) => void;
	onReady: () => void;
	onArrival: (progress: number) => void;
	onArrived: () => void;
	arrived: boolean;
} = {
	journey: createJourney(),
	arrival: createArrival(),
	clock: { current: 0 },
	reduced: { current: false },
	phase: { current: "intro" },
	audio: { current: null },
	onProgress: () => {},
	onReady: () => {},
	onArrival: () => {},
	onArrived: () => {},
	arrived: false,
};

export const libraryHostHandlers = {
	onScreenshot: () => {},
};

export function resetJourneySession() {
	const journey = createJourney();
	journeySession.journey.target = journey.target;
	journeySession.journey.display = journey.display;
	journeySession.journey.pending = journey.pending;
	resetArrival(journeySession.arrival);
	journeySession.clock.current = 0;
	journeySession.phase.current = "intro";
	journeySession.arrived = false;
}
