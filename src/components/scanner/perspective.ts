// Perspective transform adapted from the supplied offline cropper.
export type Point = { x: number; y: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function squareToQuad(points: Point[]) {
	const [topLeft, topRight, bottomRight, bottomLeft] = points;
	const dx3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x;
	const dy3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y;
	let h31 = 0;
	let h32 = 0;

	if (Math.abs(dx3) > 1e-8 || Math.abs(dy3) > 1e-8) {
		const dx1 = topRight.x - bottomRight.x;
		const dx2 = bottomLeft.x - bottomRight.x;
		const dy1 = topRight.y - bottomRight.y;
		const dy2 = bottomLeft.y - bottomRight.y;
		const denominator = dx1 * dy2 - dx2 * dy1;
		if (Math.abs(denominator) < 1e-8)
			throw new Error("Invalid point geometry.");
		h31 = (dx3 * dy2 - dx2 * dy3) / denominator;
		h32 = (dx1 * dy3 - dx3 * dy1) / denominator;
	}

	return [
		topRight.x - topLeft.x + h31 * topRight.x,
		bottomLeft.x - topLeft.x + h32 * bottomLeft.x,
		topLeft.x,
		topRight.y - topLeft.y + h31 * topRight.y,
		bottomLeft.y - topLeft.y + h32 * bottomLeft.y,
		topLeft.y,
		h31,
		h32,
	];
}

export function outputDimensions(points: Point[]) {
	const [topLeft, topRight, bottomRight, bottomLeft] = points;
	return {
		width: Math.max(
			1,
			Math.round(
				Math.max(
					distance(topLeft, topRight),
					distance(bottomLeft, bottomRight),
				),
			),
		),
		height: Math.max(
			1,
			Math.round(
				Math.max(
					distance(topLeft, bottomLeft),
					distance(topRight, bottomRight),
				),
			),
		),
	};
}

export function isValidQuadrilateral(points: Point[]) {
	if (
		points.length !== 4 ||
		points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
	)
		return false;
	const area = Math.abs(
		points.reduce((sum, point, index) => {
			const next = points[(index + 1) % points.length];
			return sum + point.x * next.y - next.x * point.y;
		}, 0) / 2,
	);
	if (area < 16) return false;

	const signs = points.map((point, index) => {
		const next = points[(index + 1) % 4];
		const after = points[(index + 2) % 4];
		return Math.sign(
			(next.x - point.x) * (after.y - next.y) -
				(next.y - point.y) * (after.x - next.x),
		);
	});
	return signs.every((sign) => sign !== 0 && sign === signs[0]);
}
