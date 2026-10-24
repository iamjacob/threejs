/**
 * Books arrive on a shelf the way ShelfArrival does: an eased move onto the
 * arranged pose plus a sine lift. One onboarding clock drives every copy.
 */

export const FLIGHT_DURATION = 2.7;

export function flightProgress(clock: number, delay: number, reduced: boolean) {
	if (reduced) return 1;
	if (!Number.isFinite(clock) || !Number.isFinite(delay)) return 1;
	const raw = (clock - delay) / FLIGHT_DURATION;
	if (raw <= 0) return 0;
	if (raw >= 1) return 1;
	return raw * raw * (3 - 2 * raw);
}

export function flightShift(progress: number, index: number, reduced: boolean) {
	if (reduced || progress >= 1) return { x: 0, y: 0, z: 0 };
	const leave = 1 - progress;
	const swing = index % 2 === 0 ? 1 : -1;
	return {
		x: leave * 1.35 * swing,
		y: Math.sin(Math.max(0, progress) * Math.PI) * 0.85 + leave * 1.25,
		z: leave * -1.8,
	};
}

export function landingDelay(
	stationT: number,
	indexOnShelf: number,
	journeySeconds = 46,
) {
	return Math.max(0.3, stationT * journeySeconds - 2.6) + indexOnShelf * 0.28;
}
