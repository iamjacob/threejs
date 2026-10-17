import type { ShelfBook } from "../components/shelves/shelfBooks";

export type ShelfLayout = "upright" | "lean" | "flat" | "stack" | "fan";
export type ShelfFace = "cover" | "spine" | "back";
export type ShelfView = "front" | "threeQuarter" | "top";
export type ShelfZoom = "book" | "shelf" | "library";
export type ShelfGroupBy = "author" | "height" | "none";
export type BookArrangement = {
	shelf: number;
	layout: Exclude<ShelfLayout, "stack">;
	angle: number;
	face: ShelfFace;
};
export type BookStack = {
	id: string;
	/** Bottom to top, matching the physical stack. */
	bookIds: string[];
	alternateSpines: boolean;
	flipped: boolean;
};
export type ShelfGroup = { id: string; name: string; bookIds: string[] };
export type ShelfDocument = {
 fullCircle?: boolean;
	items: Record<string, BookArrangement>;
	order: string[];
	stacks: BookStack[];
	groups: ShelfGroup[];
	spacing: number;
	alignment: "left" | "center" | "right";
};

export function createShelfDocument(books: ShelfBook[]): ShelfDocument {
	const find = (title: string) =>
		books.find((book) => book.title.toLowerCase() === title.toLowerCase())?.id;
	const rows = [
		[
			"Discipline is Destiny",
			"Shaolin spirit",
			"Stilness is the Key",
			"Seneca",
		],
		["THE DAILY STOIC", "BEHAVE", "Small Data"],
		[
			"Empowered",
			"Blitzscaling",
			"Traction",
			"Four Thousand Weeks",
			"THE SOURCE",
		],
		[
			"What's Your DREAM?",
			"Be useful",
			"How big things get done",
			"A course in miracles",
			"Mit liv med Fangekoret",
		],
	];
	const items: ShelfDocument["items"] = {};
	const order: string[] = [];
	rows.forEach((titles, row) => {
		for (const title of titles) {
			const id = find(title);
			if (!id) continue;
			items[id] = {
				shelf: 3 - row,
				layout: title === "Stilness is the Key" ? "lean" : "upright",
				angle: title === "Stilness is the Key" ? -10 : 0,
				face: "cover",
			};
			order.push(id);
		}
	});
	for (const book of books) {
		if (items[book.id]) continue;
		items[book.id] = {
			shelf: order.length % 4,
			layout: "upright",
			angle: 0,
			face: "cover",
		};
		order.push(book.id);
	}
	const stackIds = [
		find("Traction"),
		find("Blitzscaling"),
		find("Empowered"),
	].filter((id): id is string => Boolean(id));
	const favorites = [
		find("THE DAILY STOIC"),
		find("BEHAVE"),
		find("Small Data"),
	].filter((id): id is string => Boolean(id));
	return {
		items,
		order,
		spacing: 0.16,
		alignment: "center",
		stacks:
			stackIds.length > 1
				? [
						{
							id: "business-stack",
							bookIds: stackIds,
							alternateSpines: false,
							flipped: false,
						},
					]
				: [],
		groups:
			favorites.length > 1
				? [{ id: "favorites", name: "On my mind", bookIds: favorites }]
				: [],
	};
}

export function detachBooks(
	document: ShelfDocument,
	ids: string[],
): ShelfDocument {
	const removed = new Set(ids);
	return {
		...document,
		stacks: document.stacks
			.map((stack) => ({
				...stack,
				bookIds: stack.bookIds.filter((id) => !removed.has(id)),
			}))
			.filter((stack) => stack.bookIds.length > 1),
		groups: document.groups
			.map((group) => ({
				...group,
				bookIds: group.bookIds.filter((id) => !removed.has(id)),
			}))
			.filter((group) => group.bookIds.length > 1),
	};
}
