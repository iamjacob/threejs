import { Euler } from "three";
import { shelfBookPose } from "../shelves/Bookshelves";

export function focusBookPosition(id: string): [number, number, number] {
	const { position } = shelfBookPose(id);
	return [position[0] * 0.16, position[1] * 0.12, 0];
}

// Face the spread (+X) toward the camera (+Z), then lean it back in depth.
// Keep the spine upright on screen, with no sideways roll.
export const BOOK_ROTATION = new Euler(-Math.PI / 8, -Math.PI / 2, 0, "ZXY");
