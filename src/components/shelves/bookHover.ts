import { type Color, Euler, type Matrix4, Quaternion, Vector3 } from "three";
import type { ArrangedBook } from "./shelfArrangement";

/** World units toward the viewer. Tuned against books that are ~0.5–0.8 tall. */
export const BOOK_HOVER_LIFT = 0.05;
/** Full emphasis scale, inside the 1.03–1.04 range. */
export const BOOK_HOVER_SCALE = 1.035;
const HOVER_DAMP = 14;

/** Frame-rate independent smoothing. Reduced motion snaps to the target. */
export function dampToward(
	current: number,
	target: number,
	delta: number,
	reducedMotion: boolean,
) {
	if (reducedMotion) return target;
	const dt = Math.min(Math.max(delta, 0), 0.1);
	const next = current + (target - current) * (1 - Math.exp(-dt * HOVER_DAMP));
	return Math.abs(next - target) < 0.001 ? target : next;
}

/**
 * Press pulse in [0, 1]. A short hold, then a quick release.
 * Negative age means no press is playing.
 */
export function pressEnvelope(age: number) {
	if (age < 0) return 0;
	// Hold long enough for the damper to arrive at the same lift as a hover.
	if (age < 0.18) return 1;
	const release = Math.exp(-(age - 0.18) * 12);
	return release < 0.02 ? 0 : release;
}

/** White at rest, a soft warm tint at full emphasis. */
export function warmBookColor(amount: number, color: Color) {
	color.setRGB(1, 1 - 0.08 * amount, 1 - 0.2 * amount);
	return color;
}

const position = new Vector3();
const radial = new Vector3();
const quaternion = new Quaternion();
const scale = new Vector3();
const euler = new Euler();

/**
 * Shelf-local instance matrix. The camera stands inside the ring, so emphasis
 * eases the book toward the shelf origin — toward the viewer, off the shelf.
 */
export function composeShelfBook(
	placement: ArrangedBook,
	emphasis: number,
	target: Matrix4,
) {
	position.set(...placement.position);
	if (emphasis > 0) {
		radial.set(position.x, 0, position.z);
		if (radial.lengthSq() > 1e-8) {
			radial.normalize().multiplyScalar(-BOOK_HOVER_LIFT * emphasis);
			position.add(radial);
		}
	}
	quaternion.setFromEuler(euler.set(...placement.rotation));
	const factor = placement.scale * (1 + (BOOK_HOVER_SCALE - 1) * emphasis);
	const [width, height, depth] = placement.book.dimensions;
	scale.set(width * factor, height * factor, depth * factor);
	target.compose(position, quaternion, scale);
	return target;
}

/** Book-local direction that matches `composeShelfBook`'s viewer-facing lift. */
export function bookLiftAxis(
	shelfPosition: readonly [number, number, number],
	shelfRotation: readonly [number, number, number],
) {
	const axis = new Vector3(shelfPosition[0], 0, shelfPosition[2]);
	if (axis.lengthSq() < 1e-8) axis.set(0, 0, 1);
	else axis.normalize();
	axis.negate();
	const q = new Quaternion().setFromEuler(new Euler(...shelfRotation)).invert();
	return axis.applyQuaternion(q);
}
