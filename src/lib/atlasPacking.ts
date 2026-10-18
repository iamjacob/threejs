export type AtlasInput = { id: string; width: number; height: number };
export type AtlasRegion = {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
};
export type AtlasLayout = { size: number; regions: AtlasRegion[] };

/**
 * Row ("shelf") packing: images are sorted by height, laid out left to right,
 * and a new row starts when the current one is full. The smallest power-of-two
 * square that fits every image is chosen so a single texture bind serves all
 * covers. `padding` keeps bilinear filtering from bleeding neighbouring covers.
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
	const regions: AtlasRegion[] = [];
	let x = padding;
	let y = padding;
	let rowHeight = 0;
	for (const { id, width, height } of sorted) {
		if (width + 2 * padding > size || height + 2 * padding > size) return null;
		if (x + width + padding > size) {
			x = padding;
			y += rowHeight + padding;
			rowHeight = 0;
		}
		if (y + height + padding > size) return null;
		regions.push({ id, x, y, width, height });
		x += width + padding;
		rowHeight = Math.max(rowHeight, height);
	}
	return regions;
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
