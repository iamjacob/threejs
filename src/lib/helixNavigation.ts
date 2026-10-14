export const HELIX_HEIGHT = 128;
export const HELIX_SPACING = 48;
export const HELIX_RADIUS = 13;
export const HELIX_TWIST = 118;

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

/** Shelf order is shared with the scene; removed and duplicate IDs never become nav items. */
export function helixBooks<T extends { id: string }>(
	books: T[],
	order: string[],
	hidden: string[] = [],
) {
	const byId = new Map(books.map((book) => [book.id, book]));
	const excluded = new Set(hidden);
	return [...new Set(order)].flatMap((id) => {
		const book = byId.get(id);
		return book && !excluded.has(id) ? [book] : [];
	});
}

/** The reference's two-strand geometry, now indexed by actual books instead of made-up dates. */
export function helixBookPose(
	index: number,
	position: number,
	spacing: number,
) {
	const x = (index - position) * spacing;
	const phase =
		(index * spacing * Math.PI * 2) / HELIX_TWIST + (index % 2) * Math.PI;
	const y = Math.sin(phase) * HELIX_RADIUS;
	const z = Math.cos(phase) * HELIX_RADIUS;
	const depth = (z / HELIX_RADIUS + 1) / 2;
	const proximity = Math.max(0, 1 - Math.abs(x) / spacing);
	const focus = proximity * proximity * (3 - 2 * proximity);
	return {
		x,
		y,
		z: z + focus * 65,
		scale: (0.6 + 0.4 * depth) * (1 + focus * 2),
		focus,
	};
}

export function createHelixNavigation(
	count: number,
	initial: number,
	onSelect: (index: number) => void,
	reducedMotion = false,
) {
	const last = Math.max(0, count - 1);
	const bounded = (value: number) =>
		clamp(Number.isFinite(value) ? value : 0, 0, last);
	let selected = Math.round(bounded(initial));
	let position = selected;
	let target = selected;
	let spacing = HELIX_SPACING;
	let dragging = false;
	let lastX = 0;
	let lastTime = 0;
	let travel = 0;
	let velocity = 0;
	const choose = (index: number, emit = true) => {
		selected = target = Math.round(bounded(index));
		dragging = false;
		velocity = 0;
		if (emit && count) onSelect(selected);
	};
	return {
		get state() {
			return { position, target, spacing, dragging, selected };
		},
		choose,
		sync(index: number) {
			choose(index, false);
		},
		begin(x: number, time: number) {
			dragging = true;
			lastX = x;
			lastTime = time;
			travel = velocity = 0;
		},
		move(x: number, time: number) {
			if (!dragging) return;
			const dx = x - lastX;
			travel += Math.abs(dx);
			const next = bounded(position - dx / spacing);
			velocity = clamp(
				(next - position) / Math.max(8, time - lastTime),
				-0.015,
				0.015,
			);
			position = target = next;
			lastX = x;
			lastTime = time;
		},
		end(offsetFromCenter: number, time: number) {
			if (!dragging) return;
			const momentum = time - lastTime < 100 ? velocity * 140 : 0;
			choose(
				travel < 5
					? position + offsetFromCenter / spacing
					: position + momentum,
			);
		},
		cancel() {
			choose(selected, false);
		},
		scroll(pixels: number) {
			dragging = false;
			position = target = bounded(position + (pixels / spacing) * 0.55);
		},
		settle() {
			choose(position);
		},
		zoom(factor: number) {
			if (Number.isFinite(factor) && factor > 0)
				spacing = clamp(spacing * factor, 28, 84);
		},
		key(key: string) {
			if (key === "+" || key === "=") {
				this.zoom(1.2);
				return true;
			}
			if (key === "-") {
				this.zoom(1 / 1.2);
				return true;
			}
			if (key === "ArrowRight") choose(selected + 1);
			else if (key === "ArrowLeft") choose(selected - 1);
			else if (key === "Home") choose(0);
			else if (key === "End") choose(last);
			else if (key === "Enter" || key === " ") choose(selected);
			else return false;
			return true;
		},
		tick(delta: number) {
			if (dragging) return false;
			position +=
				(target - position) *
				(reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * 13));
			if (Math.abs(target - position) < 0.001) position = target;
			return position !== target;
		},
	};
}
