export type AtlasInput = { id: string; width: number; height: number };
export type AtlasRegion = {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
};
export type AtlasLayout = { size: number; regions: AtlasRegion[] };

type FreeRect = { x: number; y: number; width: number; height: number };

/**
 * MaxRects (bottom-left) packing: images are sorted by height then width and
 * placed into the lowest, leftmost free rectangle that fits. Splitting free
 * rectangles lets narrow spines and short page-edge textures tuck into the
 * leftover ends of earlier cover rows so catalog + local books pack tightly
 * into one power-of-two square atlas texture. `padding` keeps bilinear
 * filtering from bleeding neighbouring covers.
 */
export function packAtlas(
	inputs: AtlasInput[],
	{ padding = 2, maxSize = 4096 } = {},
): AtlasLayout {
	const sorted = [...inputs].sort(
		(a, b) =>
			b.height - a.height || b.width - a.width || (a.id < b.id ? -1 : 1),
	);
	const area = sorted.reduce(
		(sum, { width, height }) => sum + (width + padding) * (height + padding),
		0,
	);
	let size = 256;
	while (size * size < area && size < maxSize) size *= 2;
	for (; size <= maxSize; size *= 2) {
		const regions = packInto(sorted, size, padding);
		if (regions) return { size, regions };
	}
	throw new Error(
		`Atlas inputs do not fit into ${maxSize}x${maxSize}; reduce image sizes or raise maxSize.`,
	);
}

function packInto(sorted: AtlasInput[], size: number, padding: number) {
	const usable = size - padding;
	if (usable <= padding) return null;
	let free: FreeRect[] = [
		{
			x: padding,
			y: padding,
			width: size - padding * 2,
			height: size - padding * 2,
		},
	];
	const regions: AtlasRegion[] = [];
	for (const { id, width, height } of sorted) {
		if (width + 2 * padding > size || height + 2 * padding > size) return null;
		let best: FreeRect | null = null;
		for (const rect of free) {
			if (rect.width < width || rect.height < height) continue;
			if (!best || rect.y < best.y || (rect.y === best.y && rect.x < best.x)) {
				best = rect;
			}
		}
		if (!best) return null;
		const placed = {
			x: best.x,
			y: best.y,
			width: width + padding,
			height: height + padding,
		};
		regions.push({ id, x: best.x, y: best.y, width, height });
		const next: FreeRect[] = [];
		for (const rect of free) {
			if (
				placed.x >= rect.x + rect.width ||
				placed.x + placed.width <= rect.x ||
				placed.y >= rect.y + rect.height ||
				placed.y + placed.height <= rect.y
			) {
				next.push(rect);
				continue;
			}
			if (placed.x > rect.x) {
				next.push({
					x: rect.x,
					y: rect.y,
					width: placed.x - rect.x,
					height: rect.height,
				});
			}
			if (placed.x + placed.width < rect.x + rect.width) {
				next.push({
					x: placed.x + placed.width,
					y: rect.y,
					width: rect.x + rect.width - (placed.x + placed.width),
					height: rect.height,
				});
			}
			if (placed.y > rect.y) {
				next.push({
					x: rect.x,
					y: rect.y,
					width: rect.width,
					height: placed.y - rect.y,
				});
			}
			if (placed.y + placed.height < rect.y + rect.height) {
				next.push({
					x: rect.x,
					y: placed.y + placed.height,
					width: rect.width,
					height: rect.y + rect.height - (placed.y + placed.height),
				});
			}
		}
		free = pruneFreeRects(next);
	}
	return regions;
}

function pruneFreeRects(rects: FreeRect[]) {
	const kept: FreeRect[] = [];
	for (let i = 0; i < rects.length; i++) {
		const a = rects[i];
		if (a.width <= 0 || a.height <= 0) continue;
		let contained = false;
		for (let j = 0; j < rects.length; j++) {
			if (i === j) continue;
			const b = rects[j];
			if (
				a.x >= b.x &&
				a.y >= b.y &&
				a.x + a.width <= b.x + b.width &&
				a.y + a.height <= b.y + b.height &&
				(a.x > b.x ||
					a.y > b.y ||
					a.width < b.width ||
					a.height < b.height ||
					i > j)
			) {
				contained = true;
				break;
			}
		}
		if (!contained) kept.push(a);
	}
	return kept;
}

/** UV transform for a region: `uv * repeat + offset`, with the Y axis flipped as three.js expects. */
export function atlasUvTransform(region: AtlasRegion, size: number) {
	return {
		offset: [region.x / size, 1 - (region.y + region.height) / size] as [
			number,
			number,
		],
		repeat: [region.width / size, region.height / size] as [number, number],
	};
}
