import type { AuraBook, Ember, ReadState } from "./mockData";

export type {
	AuraBook,
	AuraLabel,
	AuraPatch,
	AuraSearch,
	Ember,
	FriendCopy,
	FriendId,
	OwnKind,
	ReadState,
	ShareScope,
	ShelfId,
} from "./mockData";

/**
 * Signals the aura shader and the friend-ember layer read for one book.
 * `AuraBook` is this plus the example shelf's title, size and lending copy.
 * A host with real data can build the same shape and skip the mock shelf.
 */
export type BookAuraSignals = Pick<
	AuraBook,
	| "bookId"
	| "alignment"
	| "liked"
	| "read"
	| "progress"
	| "owned"
	| "invite"
	| "friendColor"
	| "seed"
	| "embers"
	| "extra"
	| "mine"
	| "quiet"
>;

export type AuraReadState = ReadState;
export type AuraEmber = Ember;
