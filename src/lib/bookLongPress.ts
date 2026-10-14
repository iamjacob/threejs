export const BOOK_HOLD_MS = 480;
const MOVE_TOLERANCE = 8;
type Pointer = { pointerId: number; clientX: number; clientY: number };

/** A hold is separate from a tap or an orbit/pinch gesture. */
export function createBookLongPress(onHold: (pointer: Pointer) => void) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let origin: Pointer | null = null;
	let held = false;
	const cancel = () => {
		clearTimeout(timer);
		timer = undefined;
		origin = null;
	};
	return {
		start(pointer: Pointer & { button: number; isPrimary: boolean }) {
			cancel();
			held = false;
			if (pointer.button !== 0 || !pointer.isPrimary) return;
			origin = {
				pointerId: pointer.pointerId,
				clientX: pointer.clientX,
				clientY: pointer.clientY,
			};
			timer = setTimeout(() => {
				timer = undefined;
				held = true;
				if (origin) onHold(origin);
			}, BOOK_HOLD_MS);
		},
		move(pointer: Pointer) {
			if (
				origin?.pointerId === pointer.pointerId &&
				Math.hypot(
					pointer.clientX - origin.clientX,
					pointer.clientY - origin.clientY,
				) > MOVE_TOLERANCE
			)
				cancel();
		},
		end(pointer: Pick<Pointer, "pointerId">) {
			if (pointer.pointerId === origin?.pointerId) cancel();
		},
		additionalPointer(pointer: Pick<Pointer, "pointerId">) {
			if (origin && pointer.pointerId !== origin.pointerId) cancel();
		},
		cancel,
		consumeClick() {
			const suppress = held;
			held = false;
			return suppress;
		},
	};
}

export function vibrateBookEdit() {
	// Vibration is optional; unsupported browsers still enter editing normally.
	try {
		if (typeof navigator !== "undefined") navigator.vibrate?.(20);
	} catch {
		// Some embedded browsers expose the API but deny access to the hardware.
	}
}
