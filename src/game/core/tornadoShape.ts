/**
 * Spiral book layout from the old app's `Tornado.tsx` / `book-vortex.web.tsx`
 * (radius·(1 − t^1.2), 16π turns, height·(1 − t)). Pure numbers; the renderer turns these into
 * instance matrices once, not per frame.
 */
export type TornadoBook = {
	x: number;
	y: number;
	z: number;
	rotY: number;
	rotZ: number;
	scale: number;
};

export function tornadoLayout(
	count: number,
	height: number,
	radius: number,
): TornadoBook[] {
	const books: TornadoBook[] = [];
	for (let i = 0; i < count; i++) {
		const t = count <= 1 ? 0 : i / (count - 1);
		const r = radius * (1 - t ** 1.2);
		const angle = t * Math.PI * 16;
		books.push({
			x: r * Math.cos(angle),
			y: height * (1 - t),
			z: r * Math.sin(angle),
			rotY: Math.atan2(Math.cos(angle), -Math.sin(angle)),
			rotZ: t * Math.PI * 0.5,
			scale: 0.72 + (1 - t) * 0.24,
		});
	}
	return books;
}
