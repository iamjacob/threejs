import { MathUtils, Vector3 } from "three";

export const LIBRARY_ENTRANCE_SECONDS = 1.8;

/** A short descending arc and dolly-in, ending at the normal shelf framing. */
export function libraryEntrancePose(
	center: Vector3,
	distance: number,
	elapsed: number,
) {
	const progress = MathUtils.smootherstep(
		elapsed / LIBRARY_ENTRANCE_SECONDS,
		0,
		1,
	);
	const remaining = 1 - progress;
	const angle = -0.16 * remaining;
	const radius = distance * (1 + 0.2 * remaining);
	const target = center
		.clone()
		.add(new Vector3(0, distance * 0.035 * remaining, 0));
	const position = target
		.clone()
		.add(
			new Vector3(
				Math.sin(angle) * radius,
				radius * (0.12 + 0.075 * remaining),
				Math.cos(angle) * radius * 0.993,
			),
		);
	return { position, target };
}
