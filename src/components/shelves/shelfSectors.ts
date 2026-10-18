import type { ArrangedBook } from "./shelfArrangement";

/**
 * The ring is split into equal angular sectors so three.js can frustum-cull
 * whole instanced batches instead of drawing all books every frame. The
 * camera stands inside the ring and sees ~75° at most, so with 8 sectors only
 * 2–3 batches are ever drawn.
 */
export const SHELF_SECTORS = 8;

/** Sector index for a placement, derived from its angle around the Y axis. */
export function sectorOf(
	position: readonly [number, number, number],
	sectors = SHELF_SECTORS,
) {
	// Shelf arcs are centred on +X (angle 0); atan2 is in (-π, π].
	const angle = Math.atan2(-position[2], position[0]);
	const turns = (angle / (Math.PI * 2) + 1) % 1;
	return Math.min(sectors - 1, Math.floor(turns * sectors));
}

export function groupBySector<T extends { placement: ArrangedBook }>(
	entries: T[],
	sectors = SHELF_SECTORS,
) {
	const groups = new Map<number, T[]>();
	for (const entry of entries) {
		const sector = sectorOf(entry.placement.position, sectors);
		const bucket = groups.get(sector);
		if (bucket) bucket.push(entry);
		else groups.set(sector, [entry]);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => a - b)
		.map(([sector, items]) => ({ sector, items }));
}
