/**
 * Where the 0.4 magnifier goes: right beside the dragged corner, on the side
 * with room, so it never sits under the finger and never leaves the crop box.
 */
export type LoupeBox = { left: number; top: number; size: number };

/** Gap (CSS px) between the pointer and the lens edge: clears the corner dot. */
export const LOUPE_GAP = 26;
/** Keep the lens this far inside the crop box. */
export const LOUPE_MARGIN = 6;

export function placeLoupe(
	pointer: { x: number; y: number },
	box: { width: number; height: number },
	wanted: number,
	gap = LOUPE_GAP,
	margin = LOUPE_MARGIN,
): LoupeBox {
	// Never bigger than the box; never so small it stops being useful.
	const size = Math.max(
		64,
		Math.min(wanted, box.width - margin * 2, box.height - margin * 2),
	);
	const clampX = (x: number) =>
		Math.max(margin, Math.min(box.width - size - margin, x));
	const clampY = (y: number) =>
		Math.max(margin, Math.min(box.height - size - margin, y));
	const fitsX = (x: number) => x >= margin && x + size <= box.width - margin;
	const fitsY = (y: number) => y >= margin && y + size <= box.height - margin;
	const centredY = clampY(pointer.y - size / 2);
	const centredX = clampX(pointer.x - size / 2);
	// Beside first (the side with more room), then above, then below.
	const preferRight = pointer.x < box.width / 2;
	const right = pointer.x + gap;
	const left = pointer.x - gap - size;
	const above = pointer.y - gap - size;
	const below = pointer.y + gap;
	const candidates = [
		preferRight ? { left: right, top: centredY } : { left, top: centredY },
		preferRight ? { left, top: centredY } : { left: right, top: centredY },
		{ left: centredX, top: above },
		{ left: centredX, top: below },
	];
	const fit = candidates.find((c) => fitsX(c.left) && fitsY(c.top));
	if (fit) return { ...fit, size };
	// Tiny box: stay beside on the roomier side, clamped inside.
	return { left: clampX(candidates[0].left), top: centredY, size };
}
