import { shelfBookPose } from "../shelves/Bookshelves";

export function focusBookPosition(id: string): [number, number, number] {
	const { position } = shelfBookPose(id);
	return [position[0] * 0.16, position[1] * 0.12, 0];
}

export const BOOK_TILT = Math.PI / 4;
