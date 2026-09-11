type Acceleration = { x: number | null; y: number | null; z: number | null };

// Require repeated, separated jolts, rather than reacting to a single tilt.
export function createShakeDetector() {
	let previous: number[] | null = null;
	let lastSample = 0;
	let lastJolt = -Infinity;
	let jolts = 0;
	let cooldownUntil = 0;
	return (acceleration: Acceleration | null, time: number) => {
		if (
			!acceleration ||
			acceleration.x === null ||
			acceleration.y === null ||
			acceleration.z === null ||
			[acceleration.x, acceleration.y, acceleration.z].some(
				(value) => value === null || !Number.isFinite(value),
			)
		)
			return false;
		const sample = [acceleration.x, acceleration.y, acceleration.z];
		if (!previous || time - lastSample > 500) {
			previous = sample;
			lastSample = time;
			jolts = 0;
			return false;
		}
		const previousSample = previous;
		const change = Math.hypot(
			...sample.map((value, index) => value - previousSample[index]),
		);
		previous = sample;
		lastSample = time;
		if (time < cooldownUntil || change < 16 || time - lastJolt < 100)
			return false;
		jolts = time - lastJolt < 900 ? jolts + 1 : 1;
		lastJolt = time;
		if (jolts < 3) return false;
		jolts = 0;
		cooldownUntil = time + 2500;
		return true;
	};
}
