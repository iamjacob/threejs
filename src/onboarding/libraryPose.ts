import { shelfFraming } from "../components/layout/DemoCamera";

/** Library page colour. The flight ends on this so the hand-off does not flash. */
export const LIBRARY_CLEAR = "#07182c";

/** Resting shelf camera, matching TourCamera once the entrance dolly is skipped. */
export function libraryRestPose(
	aspect: number,
	bookHeight: number,
	isMobile: boolean,
	arcFraction?: number,
) {
	const framing = shelfFraming(
		4,
		aspect,
		bookHeight,
		true,
		isMobile,
		arcFraction,
	);
	return {
		position: [
			framing.target.x,
			framing.target.y + framing.distance * 0.12,
			framing.target.z + framing.distance * 0.993,
		] as [number, number, number],
		target: [framing.target.x, framing.target.y, framing.target.z] as [
			number,
			number,
			number,
		],
		fov: 45,
		distance: framing.distance,
	};
}
