import type { AuraStyleName } from "./styles";

/**
 * EXAMPLE DATA. There is no taste, rating, read-state, ownership or friends
 * source yet. Names, colours and lending flags below are made up. Titles and
 * sizes match the playground catalog so a host can render the same ids with
 * its own book mesh; nothing here imports that catalog.
 */

export const AURA_EXAMPLE_NOTE =
	"Example data only. Taste, ratings, read state, ownership and who can lend are mocked — nothing is saved.";

export type ShelfId = "me" | "freja";
export type ShareScope = "owned" | "reading" | "likes";
export type OwnKind = "yours" | "wishlist" | "borrowed" | "library" | "none";
export type ReadState = 0 | 1 | 2 | 3;
export type FriendId = "freja" | "mads" | "ingrid" | "teo" | "aino";

export const FRIENDS: Record<
	FriendId,
	{ name: string; color: string; share_scope: ShareScope }
> = {
	freja: { name: "Freja", color: "#ff9f6e", share_scope: "likes" },
	mads: { name: "Mads", color: "#7fc8ff", share_scope: "owned" },
	ingrid: { name: "Ingrid", color: "#d3a6ff", share_scope: "owned" },
	teo: { name: "Teo", color: "#a8f08a", share_scope: "owned" },
	aino: { name: "Aino", color: "#ffd76a", share_scope: "owned" },
};

const SENECA = "978-0-141-01881-2";
const DREAM = "978-1-529-93557-8";
const DAILY = "978-1-781257654";
const BEHAVE = "978-0099575061";
const SHAOLIN = "978-87-12-80296-9";
const EMPOWERED = "9781119691297";
const SOURCE = "9781785042003";
const SMALL = "978-1-473634060";
const DISCIPLINE = "978-1-788166348";
const STILLNESS = "978-1-788162067";
const WEEKS = "978-1-784704001";
const USEFUL = "978-1-529146554";

/** Taste alignment to "you", 0..1. Example only. */
const TASTE: Record<string, number> = {
	[SENECA]: 0.95,
	[DREAM]: 0.8,
	[DAILY]: 0.9,
	[BEHAVE]: 0.15,
	[SHAOLIN]: 0.55,
	[EMPOWERED]: 0.7,
	[SOURCE]: 0.2,
	[SMALL]: 0.62,
	[DISCIPLINE]: 0.85,
	[STILLNESS]: 0.35,
	[WEEKS]: 0.6,
	[USEFUL]: 0.78,
};

type MyEntry = {
	bookId: string;
	liked: number;
	read: 0 | 1 | 2;
	progress: number;
	own: OwnKind;
	from?: FriendId;
};

const MY_SHELF: MyEntry[] = [
	{ bookId: SENECA, liked: 0.95, read: 2, progress: 1, own: "yours" },
	{ bookId: DREAM, liked: 0, read: 1, progress: 0.35, own: "yours" },
	{ bookId: DAILY, liked: 0, read: 0, progress: 0, own: "wishlist" },
	{ bookId: BEHAVE, liked: -0.8, read: 2, progress: 1, own: "yours" },
	{
		bookId: SHAOLIN,
		liked: 0.5,
		read: 2,
		progress: 1,
		own: "borrowed",
		from: "freja",
	},
	{ bookId: EMPOWERED, liked: 0, read: 0, progress: 0, own: "yours" },
	{ bookId: SOURCE, liked: 0, read: 0, progress: 0, own: "none" },
	{ bookId: SMALL, liked: 0.3, read: 1, progress: 0.82, own: "library" },
];

type FrejaEntry = {
	bookId: string;
	read: 0 | 1 | 2;
	progress: number;
	rating: number;
};

const FREJA_SHELF: FrejaEntry[] = [
	{ bookId: DAILY, read: 2, progress: 1, rating: 0.9 },
	{ bookId: SENECA, read: 2, progress: 1, rating: 0.6 },
	{ bookId: SHAOLIN, read: 2, progress: 1, rating: 0.8 },
	{ bookId: DISCIPLINE, read: 2, progress: 1, rating: 0 },
	{ bookId: STILLNESS, read: 0, progress: 0, rating: 0 },
	{ bookId: WEEKS, read: 2, progress: 1, rating: -0.5 },
	{ bookId: EMPOWERED, read: 1, progress: 0.7, rating: 0.3 },
	{ bookId: USEFUL, read: 0, progress: 0, rating: 0 },
];

export type FriendCopy = {
	bookId: string;
	friendId: FriendId;
	lendable: boolean;
	lentOut: boolean;
	lentTo?: "me" | FriendId;
};

const COPIES: FriendCopy[] = [
	{ bookId: SENECA, friendId: "freja", lendable: true, lentOut: false },
	{ bookId: SENECA, friendId: "mads", lendable: true, lentOut: true },
	{ bookId: DAILY, friendId: "freja", lendable: true, lentOut: false },
	{ bookId: DAILY, friendId: "ingrid", lendable: true, lentOut: false },
	{ bookId: DAILY, friendId: "aino", lendable: true, lentOut: false },
	{ bookId: DAILY, friendId: "mads", lendable: true, lentOut: true },
	{ bookId: DAILY, friendId: "teo", lendable: false, lentOut: false },
	{
		bookId: SHAOLIN,
		friendId: "freja",
		lendable: true,
		lentOut: true,
		lentTo: "me",
	},
	{ bookId: EMPOWERED, friendId: "freja", lendable: true, lentOut: false },
	{ bookId: EMPOWERED, friendId: "teo", lendable: true, lentOut: false },
	{ bookId: SMALL, friendId: "ingrid", lendable: false, lentOut: false },
	{ bookId: DISCIPLINE, friendId: "freja", lendable: true, lentOut: false },
	{ bookId: STILLNESS, friendId: "freja", lendable: false, lentOut: false },
	{ bookId: WEEKS, friendId: "freja", lendable: true, lentOut: false },
	{ bookId: USEFUL, friendId: "freja", lendable: true, lentOut: false },
];

const SCOPE_FIELDS: Record<ShareScope, string[]> = {
	owned: ["ownership", "availability"],
	reading: ["ownership", "availability", "read_state"],
	likes: ["ownership", "availability", "read_state", "rating"],
};

export type Ember = {
	color: string;
	lit: number;
	who: FriendId;
	lendable: boolean;
	lentOut: boolean;
	lentTo?: "me" | FriendId;
};

export type AuraPatch = Partial<{
	alignment: number;
	liked: number;
	read: ReadState;
	progress: number;
	owned: number;
}>;

/** Example cover identity. Dimensions are centimetres / 30, the shelf's world scale. */
const COVERS: Record<
	string,
	{ title: string; author: string; dimensions: [number, number, number] }
> = {
	[SENECA]: {
		title: "Seneca",
		author: "Seneca",
		dimensions: [0.367, 0.6, 0.023],
	},
	[DREAM]: {
		title: "What's Your DREAM?",
		author: "Simon Squibb",
		dimensions: [0.533, 0.8, 0.097],
	},
	[DAILY]: {
		title: "THE DAILY STOIC",
		author: "Ryan Holiday",
		dimensions: [0.433, 0.667, 0.09],
	},
	[BEHAVE]: {
		title: "BEHAVE",
		author: "Robert Sapolsky",
		dimensions: [0.433, 0.66, 0.133],
	},
	[SHAOLIN]: {
		title: "Shaolin spirit",
		author: "Shi Heng Yi",
		dimensions: [0.51, 0.753, 0.08],
	},
	[EMPOWERED]: {
		title: "Empowered",
		author: "Marty Cagan & Chris Jones",
		dimensions: [0.56, 0.78, 0.1],
	},
	[SOURCE]: {
		title: "THE SOURCE",
		author: "DR Tara Swart",
		dimensions: [0.427, 0.663, 0.06],
	},
	[SMALL]: {
		title: "Small Data",
		author: "Martin Lindstrom",
		dimensions: [0.45, 0.723, 0.067],
	},
	[DISCIPLINE]: {
		title: "Discipline is Destiny",
		author: "Ryan Holiday",
		dimensions: [0.433, 0.667, 0.077],
	},
	[STILLNESS]: {
		title: "Stilness is the Key",
		author: "Ryan Holiday",
		dimensions: [0.433, 0.66, 0.073],
	},
	[WEEKS]: {
		title: "Four Thousand Weeks",
		author: "Oliver Burkeman",
		dimensions: [0.433, 0.667, 0.067],
	},
	[USEFUL]: {
		title: "Be useful",
		author: "Arnold Schwarzenegger",
		dimensions: [0.423, 0.66, 0.067],
	},
};

export type AuraBook = {
	bookId: string;
	dimensions: [number, number, number];
	title: string;
	author: string;
	seed: number;
	alignment: number;
	liked: number;
	read: ReadState;
	progress: number;
	owned: number;
	own: OwnKind;
	from?: FriendId;
	invite: number;
	friendColor: string;
	mine: boolean;
	embers: Ember[];
	extra: number;
	all: Ember[];
	quiet: boolean;
	frejaCopy?: FriendCopy;
	shelf: ShelfId;
};

function hashSeed(id: string) {
	let hash = 2166136261;
	for (let i = 0; i < id.length; i++) {
		hash ^= id.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return ((hash >>> 0) % 1000) / 1000;
}

export function copyAvailable(copy: FriendCopy | undefined) {
	return !!copy && copy.lendable && !copy.lentOut;
}

function shares(friendId: FriendId, field: string, frejaShare: ShareScope) {
	const scope =
		friendId === "freja" ? frejaShare : FRIENDS[friendId].share_scope;
	return SCOPE_FIELDS[scope].includes(field);
}

function iOwn(bookId: string) {
	return MY_SHELF.some(
		(entry) => entry.bookId === bookId && entry.own === "yours",
	);
}

function embersFor(bookId: string, onlyFriend?: FriendId) {
	const all = COPIES.filter(
		(copy) =>
			copy.bookId === bookId && (!onlyFriend || copy.friendId === onlyFriend),
	)
		.map((copy) => ({
			color: FRIENDS[copy.friendId].color,
			lit: copyAvailable(copy) ? 1 : 0,
			who: copy.friendId,
			lendable: copy.lendable,
			lentOut: copy.lentOut,
			lentTo: copy.lentTo,
		}))
		.sort((a, b) => b.lit - a.lit);
	return { embers: all.slice(0, 3), extra: Math.max(0, all.length - 3), all };
}

function withCover(
	bookId: string,
	shelf: ShelfId,
	signals: Omit<
		AuraBook,
		"bookId" | "dimensions" | "title" | "author" | "seed" | "shelf"
	>,
): AuraBook {
	const cover = COVERS[bookId];
	if (!cover) throw new Error(`Aura example is missing cover ${bookId}`);
	return {
		bookId,
		...cover,
		seed: hashSeed(`${shelf}:${bookId}`),
		shelf,
		...signals,
	};
}

export function shelfItems(shelf: ShelfId, share: ShareScope): AuraBook[] {
	if (shelf === "me") {
		return MY_SHELF.map((entry) => {
			const friends = embersFor(entry.bookId);
			return withCover(entry.bookId, "me", {
				alignment: TASTE[entry.bookId] ?? 0.5,
				liked: entry.liked,
				read: entry.read,
				progress: entry.progress,
				owned: entry.own === "yours" ? 1 : 0,
				own: entry.own,
				from: entry.from,
				invite: 0,
				friendColor: FRIENDS.freja.color,
				mine: false,
				embers: friends.embers,
				extra: friends.extra,
				all: friends.all,
				quiet: friends.all.some((ember) => ember.lit > 0),
			});
		});
	}
	return FREJA_SHELF.map((entry) => {
		const copy = COPIES.find(
			(item) => item.bookId === entry.bookId && item.friendId === "freja",
		);
		const available = copyAvailable(copy);
		const mine = iOwn(entry.bookId);
		const shareRead = shares("freja", "read_state", share);
		const shareLikes = shares("freja", "rating", share);
		return withCover(entry.bookId, "freja", {
			alignment: TASTE[entry.bookId] ?? 0.5,
			liked: shareLikes ? entry.rating : 0,
			read: shareRead ? entry.read : 3,
			progress: entry.progress,
			owned: 1,
			own: "none",
			invite: available && !mine ? 1 : 0,
			friendColor: FRIENDS.freja.color,
			mine,
			embers: [
				{
					color: FRIENDS.freja.color,
					lit: available ? 1 : 0,
					who: "freja",
					lendable: copy?.lendable ?? false,
					lentOut: copy?.lentOut ?? false,
					lentTo: copy?.lentTo,
				},
			],
			extra: 0,
			all: [],
			quiet: available && !mine,
			frejaCopy: copy,
		});
	});
}

export function applyPatch(
	book: AuraBook,
	patch: AuraPatch | undefined,
): AuraBook {
	if (!patch) return book;
	const next: AuraBook = { ...book };
	if (patch.alignment !== undefined) next.alignment = patch.alignment;
	if (patch.liked !== undefined) next.liked = patch.liked;
	if (patch.read !== undefined) next.read = patch.read;
	if (patch.progress !== undefined) next.progress = patch.progress;
	if (patch.owned !== undefined) {
		next.owned = patch.owned;
		if (book.shelf === "me") next.own = patch.owned >= 0.5 ? "yours" : "none";
	}
	return next;
}

export function patchKey(shelf: ShelfId, bookId: string) {
	return `${shelf}:${bookId}`;
}

const OWN_WORD: Record<OwnKind, string> = {
	yours: "Yours",
	wishlist: "Wishlist",
	borrowed: "Borrowed",
	library: "Library copy",
	none: "Not on your shelf",
};

export function alignWord(alignment: number) {
	if (alignment >= 0.85) return "Very you";
	if (alignment >= 0.68) return "Good match";
	if (alignment >= 0.45) return "Neutral match";
	if (alignment >= 0.3) return "Not quite you";
	return "Not your taste";
}

export function likeWord(liked: number) {
	if (liked > 0.6) return "Loved";
	if (liked > 0.02) return "Liked";
	if (liked < -0.02) return "Disliked";
	return null;
}

export function readWord(read: number, progress: number) {
	if (read === 0) return "Unread";
	if (read === 1) return `Reading · ${Math.round(progress * 100)}%`;
	if (read === 2) return "Finished";
	return null;
}

function nameList(names: string[]) {
	if (names.length <= 1) return names[0] ?? "";
	if (names.length === 2) return `${names[0]} and ${names[1]}`;
	if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
	return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export type AuraLabel = {
	title: string;
	author: string;
	status: string;
	dots: { who: string; color: string; lit: boolean }[];
	friends: string;
	note: string;
};

export function labelFor(book: AuraBook, share: ShareScope): AuraLabel {
	if (book.shelf === "freja") {
		const shareRead = shares("freja", "read_state", share);
		const shareLikes = shares("freja", "rating", share);
		const liked = likeWord(book.liked);
		const status = [
			alignWord(book.alignment),
			shareLikes && liked ? `Freja ${liked.toLowerCase()} it` : null,
			shareRead
				? book.read === 0
					? "Freja hasn't started"
					: book.read === 1
						? `Freja is reading · ${Math.round(book.progress * 100)}%`
						: book.read === 2
							? "Freja finished it"
							: null
				: null,
		].filter((part): part is string => !!part);
		const copy = book.frejaCopy;
		const lit = (book.embers[0]?.lit ?? 0) > 0;
		let friends = "Freja isn't lending this one";
		if (book.mine) friends = "You own it too";
		else if (copy && copyAvailable(copy)) friends = "Freja can lend this";
		else if (copy?.lentOut)
			friends =
				copy.lentTo === "me"
					? "You're borrowing Freja's copy"
					: "Lent out right now";
		const hidden = [
			shareRead ? null : "read status",
			shareLikes ? null : "likes",
		].filter((part): part is string => !!part);
		return {
			title: book.title,
			author: book.author,
			status: status.join(" · "),
			dots: [{ who: "freja", color: FRIENDS.freja.color, lit }],
			friends,
			note: hidden.length ? `Freja doesn't share ${hidden.join(" or ")}` : "",
		};
	}
	const own =
		book.own === "borrowed" && book.from
			? `Borrowed from ${FRIENDS[book.from].name}`
			: book.owned >= 0.5
				? "Yours"
				: OWN_WORD[book.own];
	const status = [
		alignWord(book.alignment),
		likeWord(book.liked),
		readWord(book.read, book.progress),
		own,
	].filter((part): part is string => !!part);
	const lit = book.all.filter((ember) => ember.lit > 0);
	const dim = book.all.filter((ember) => ember.lit <= 0);
	if (lit.length) {
		return {
			title: book.title,
			author: book.author,
			status: status.join(" · "),
			dots: lit.slice(0, 3).map((ember) => ({
				who: ember.who,
				color: ember.color,
				lit: true,
			})),
			friends: `${nameList(lit.map((ember) => FRIENDS[ember.who].name))} can lend this`,
			note: "",
		};
	}
	if (dim[0]) {
		const ember = dim[0];
		const name = FRIENDS[ember.who].name;
		const friends =
			ember.lentTo === "me"
				? `You're reading ${name}'s copy`
				: `${name} has it · ${ember.lentOut ? "lent out" : "not lending"}`;
		return {
			title: book.title,
			author: book.author,
			status: status.join(" · "),
			dots: [{ who: ember.who, color: ember.color, lit: false }],
			friends,
			note: "",
		};
	}
	return {
		title: book.title,
		author: book.author,
		status: status.join(" · "),
		dots: [],
		friends: "No friends have this yet",
		note: "",
	};
}

export type AuraSearch = {
	shelf?: ShelfId;
	share?: ShareScope;
	style?: AuraStyleName;
	focus?: string | number;
	rm?: boolean;
	dev?: boolean;
	t?: number;
};

export function parseAuraSearch(search: Record<string, unknown>): AuraSearch {
	const out: AuraSearch = {};
	if (search.shelf === "freja") out.shelf = "freja";
	if (search.share === "owned" || search.share === "reading")
		out.share = search.share;
	if (search.style === "chakra" || search.style === "arcane")
		out.style = search.style;
	const focus = focusParam(search.focus);
	if (focus !== undefined) out.focus = focus;
	if (search.rm === "1" || search.rm === 1 || search.rm === true) out.rm = true;
	if (search.dev === "1" || search.dev === 1 || search.dev === true)
		out.dev = true;
	if (search.t !== undefined && search.t !== "") {
		const time = Number(search.t);
		if (Number.isFinite(time)) out.t = time;
	}
	return out;
}

/** Small indexes stay numbers so the URL reads `focus=2`, not a quoted string. */
function focusParam(value: unknown): string | number | undefined {
	if (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 0 &&
		value < 100
	)
		return value;
	if (typeof value !== "string" || value === "") return undefined;
	if (/^(?:0|[1-9]\d?)$/.test(value)) return Number(value);
	return value;
}

export function resolveFocusId(
	items: AuraBook[],
	focus: string | number | undefined,
) {
	if (focus === undefined) return items[0]?.bookId ?? null;
	const text = String(focus);
	if (text === "none") return null;
	const index = typeof focus === "number" ? focus : Number(text);
	if (
		Number.isInteger(index) &&
		text === String(index) &&
		index >= 0 &&
		items[index]
	)
		return items[index].bookId;
	if (items.some((item) => item.bookId === text)) return text;
	return items[0]?.bookId ?? null;
}
