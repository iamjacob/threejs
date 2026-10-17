import { isValidQuadrilateral, type Point } from "./perspective.ts";

type Pixels = { width: number; height: number; data: Uint8ClampedArray };
type Line = { x: number; y: number; rho: number; votes: number };
const angleCount = 90;
const angleStep = Math.PI / angleCount;

function intersection(a: Line, b: Line): Point | null {
	const determinant = a.x * b.y - a.y * b.x;
	if (Math.abs(determinant) < 0.25) return null;
	return {
		x: (a.rho * b.y - a.y * b.rho) / determinant,
		y: (a.x * b.rho - a.rho * b.x) / determinant,
	};
}

function orderCorners(points: Point[]) {
	const center = points.reduce(
		(sum, p) => ({ x: sum.x + p.x / 4, y: sum.y + p.y / 4 }),
		{ x: 0, y: 0 },
	);
	points.sort(
		(a, b) =>
			Math.atan2(a.y - center.y, a.x - center.x) -
			Math.atan2(b.y - center.y, b.x - center.x),
	);
	const first = points.reduce(
		(best, p, i) => (p.x + p.y < points[best].x + points[best].y ? i : best),
		0,
	);
	return [...points.slice(first), ...points.slice(0, first)];
}

// Bounded, local edge/line detection. Four supported boundary lines are required;
// isolated text corners and image borders are not treated as a detected cover.
// Hough line parameterization: https://docs.opencv.org/4.x/d9/db0/tutorial_hough_lines.html
export function detectCorners({ width, height, data }: Pixels): Point[] | null {
	if (
		width < 24 ||
		height < 24 ||
		width > 512 ||
		height > 512 ||
		data.length !== width * height * 4
	)
		return null;
	const size = width * height;
	const gray = new Float32Array(size);
	const blurred = new Float32Array(size);
	for (let i = 0; i < size; i++) {
		gray[i] =
			((data[i * 4] * 0.299 +
				data[i * 4 + 1] * 0.587 +
				data[i * 4 + 2] * 0.114) *
				data[i * 4 + 3]) /
			255;
	}
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const i = y * width + x;
			blurred[i] =
				(gray[i] * 4 +
					(gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width]) * 2 +
					gray[i - width - 1] +
					gray[i - width + 1] +
					gray[i + width - 1] +
					gray[i + width + 1]) /
				16;
		}
	}
	const magnitude = new Float32Array(size);
	const gradientX = new Float32Array(size);
	const gradientY = new Float32Array(size);
	let maximum = 0;
	for (let y = 3; y < height - 3; y++) {
		for (let x = 3; x < width - 3; x++) {
			const i = y * width + x;
			const gx =
				blurred[i - width + 1] +
				2 * blurred[i + 1] +
				blurred[i + width + 1] -
				blurred[i - width - 1] -
				2 * blurred[i - 1] -
				blurred[i + width - 1];
			const gy =
				blurred[i + width - 1] +
				2 * blurred[i + width] +
				blurred[i + width + 1] -
				blurred[i - width - 1] -
				2 * blurred[i - width] -
				blurred[i - width + 1];
			const length = Math.hypot(gx, gy);
			magnitude[i] = length;
			gradientX[i] = gx / (length || 1);
			gradientY[i] = gy / (length || 1);
			maximum = Math.max(maximum, length);
		}
	}
	if (maximum < 24) return null;
	// Estimate the noise floor so random texture cannot supply four fake edges.
	const histogram = new Uint32Array(1444);
	for (const value of magnitude) histogram[Math.min(1443, Math.floor(value))]++;
	let median = 0;
	let count = 0;
	while (count < size / 2) count += histogram[median++];
	const threshold = Math.max(24, maximum * 0.1, median * 2.5);
	const radius = Math.ceil(Math.hypot(width, height));
	const rhoCount = radius * 2 + 1;
	const accumulator = new Float32Array(angleCount * rhoCount);
	const cos = Array.from({ length: angleCount }, (_, i) =>
		Math.cos(i * angleStep),
	);
	const sin = Array.from({ length: angleCount }, (_, i) =>
		Math.sin(i * angleStep),
	);

	for (let y = 3; y < height - 3; y++) {
		for (let x = 3; x < width - 3; x++) {
			const i = y * width + x;
			if (magnitude[i] < threshold) continue;
			// Keep only the local gradient maximum to avoid voting for both sides
			// of a blurred edge. Vote near its normal rather than every angle.
			const dx = Math.round(gradientX[i]);
			const dy = Math.round(gradientY[i]);
			if (
				magnitude[i] < magnitude[i + dy * width + dx] ||
				magnitude[i] < magnitude[i - dy * width - dx]
			)
				continue;
			const normal = Math.round(
				Math.atan2(gradientY[i], gradientX[i]) / angleStep,
			);
			for (let offset = -3; offset <= 3; offset++) {
				const angle = (normal + offset + angleCount * 2) % angleCount;
				const rho = Math.round(x * cos[angle] + y * sin[angle]) + radius;
				accumulator[angle * rhoCount + rho] += 1;
			}
		}
	}

	const candidates: Line[] = [];
	const minimumVotes = Math.max(10, Math.min(width, height) * 0.045);
	for (let angle = 0; angle < angleCount; angle++) {
		for (let rho = 1; rho < rhoCount - 1; rho++) {
			const i = angle * rhoCount + rho;
			if (
				accumulator[i] < minimumVotes ||
				accumulator[i] < accumulator[i - 1] ||
				accumulator[i] < accumulator[i + 1]
			)
				continue;
			candidates.push({
				x: cos[angle],
				y: sin[angle],
				rho: rho - radius,
				votes: accumulator[i],
			});
		}
	}
	candidates.sort((a, b) => b.votes - a.votes);
	const lines: Line[] = [];
	for (const candidate of candidates) {
		if (
			lines.some((line) => {
				const dot = line.x * candidate.x + line.y * candidate.y;
				return (
					Math.abs(dot) > Math.cos(angleStep * 3) &&
					Math.abs(line.rho - Math.sign(dot) * candidate.rho) < 7
				);
			})
		)
			continue;
		lines.push(candidate);
		if (lines.length === 32) break;
	}
	const pairs: [Line, Line][] = [];
	for (let a = 0; a < lines.length; a++) {
		for (let b = a + 1; b < lines.length; b++) {
			const dot = lines[a].x * lines[b].x + lines[a].y * lines[b].y;
			if (Math.abs(dot) < 0.77) continue;
			pairs.push([lines[a], lines[b]]);
		}
	}
	const edgeSupport = (a: Point, b: Point) => {
		const length = Math.hypot(b.x - a.x, b.y - a.y);
		const nx = (a.y - b.y) / length;
		const ny = (b.x - a.x) / length;
		const samples = Math.ceil(length / 2);
		let hits = 0;
		for (let sample = 0; sample <= samples; sample++) {
			const t = sample / samples;
			const x = a.x + (b.x - a.x) * t;
			const y = a.y + (b.y - a.y) * t;
			for (let offset = -3; offset <= 3; offset++) {
				const px = Math.round(x + nx * offset);
				const py = Math.round(y + ny * offset);
				if (px < 3 || py < 3 || px >= width - 3 || py >= height - 3) continue;
				const i = py * width + px;
				if (
					magnitude[i] >= threshold &&
					Math.abs(gradientX[i] * nx + gradientY[i] * ny) > 0.85
				) {
					hits++;
					break;
				}
			}
		}
		return hits / (samples + 1);
	};
	let best: Point[] | null = null;
	let bestScore = 0;
	for (let a = 0; a < pairs.length; a++) {
		for (let b = a + 1; b < pairs.length; b++) {
			const [left, right] = pairs[a];
			const [top, bottom] = pairs[b];
			if (pairs[a].some((line) => pairs[b].includes(line))) continue;
			if (Math.abs(left.x * top.x + left.y * top.y) > 0.7) continue;
			const intersections = [
				intersection(left, top),
				intersection(right, top),
				intersection(right, bottom),
				intersection(left, bottom),
			];
			if (
				intersections.some(
					(p) =>
						!p || p.x < 1 || p.y < 1 || p.x > width - 2 || p.y > height - 2,
				)
			)
				continue;
			const points = orderCorners(intersections as Point[]);
			if (!isValidQuadrilateral(points)) continue;
			const area =
				Math.abs(
					points.reduce(
						(sum, p, i) =>
							sum + p.x * points[(i + 1) % 4].y - p.y * points[(i + 1) % 4].x,
						0,
					),
				) / 2;
			if (area < size * 0.025 || area > size * 0.94) continue;
			if (
				points.some(
					(p, i) =>
						Math.hypot(
							p.x - points[(i + 1) % 4].x,
							p.y - points[(i + 1) % 4].y,
						) < 12,
				)
			)
				continue;
			// Skip candidates that cannot beat the current result even with full support.
			if (Math.sqrt(area / size) <= bestScore) continue;
			const support = points.map((p, i) => edgeSupport(p, points[(i + 1) % 4]));
			if (Math.min(...support) < 0.62) continue;
			const coverage = support.reduce((sum, value) => sum + value, 0) / 4;
			if (coverage < 0.8) continue;
			const score = Math.sqrt(area / size) * coverage;
			if (score > bestScore) {
				bestScore = score;
				best = points;
			}
		}
	}
	return best;
}
