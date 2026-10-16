/** Cylindrical bend measured from the spine, preserving the paper's arc length. */
export function curlPagePoint(
	x: number,
	y: number,
	width: number,
	height: number,
	bend: number,
	corner = 0,
) {
	// Rotate the cylindrical crease toward the grabbed corner. Its entire spine
	// stays on the flat side, while the grabbed corner lifts first.
	const angle = Math.max(-1, Math.min(1, corner)) * 0.65;
	const ca = Math.cos(angle),
		sa = Math.sin(angle);
	const crease = width * 0.08 + (Math.abs(sa) * height) / 2;
	const across = x * ca + y * sa - crease;
	const along = -x * sa + y * ca;
	const curvature = bend / width;
	if (Math.abs(curvature) < 1e-6 || across <= 0) return { x, y, z: 0 };
	const curled = Math.sin(across * curvature) / curvature;
	return {
		x: (crease + curled) * ca - along * sa,
		y: (crease + curled) * sa + along * ca,
		z: (1 - Math.cos(across * curvature)) / curvature,
	};
}

export function releasedPageTurn(
	progress: number,
	velocity: number,
	cancelled: boolean,
	tapped: boolean,
) {
	if (cancelled) return false;
	if (tapped || progress >= 0.5) return true;
	if (Math.abs(velocity) > 0.65) return velocity > 0;
	return progress >= 0.5;
}
