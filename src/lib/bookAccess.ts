import { books as catalogBooks } from "./bookCatalog";

/**
 * Who may open a book by URL (`/book/:id`, `/read/:id`).
 * - Public BOOOKS catalog books: everyone.
 * - Books scanned on this device: only their owner. Legacy device scans belong to the persistent
 *   guest (owner-approved rule in boooks-tornado-books-plan.md); accounts own the scans that were
 *   merged into their library (`library_books` rows with client_key "scan:<id>").
 * The data layer is loaded lazily, so the shelves' first bundle and boot stay unchanged for
 * catalog books. The answer is cached per page visit; `resetBookAccess` drops it (the shelves call
 * it on mount, and profile switching happens on other routes, which unmount the shelves).
 */
const catalogIds = new Set(catalogBooks.map((b) => b.id));
export const isCatalogBook = (id: string) => catalogIds.has(id);

type Access = { all: boolean; keys: Set<string> } | "locked" | null;
let cache: Promise<Access> | undefined;

export function resetBookAccess() {
	cache = undefined;
}

async function load(): Promise<Access> {
	const [{ bootstrapData }, { listScanKeys }, { resolveActiveProfile }] =
		await Promise.all([
			import("../data/bootstrap"),
			import("../data/usecases/libraryBooks"),
			import("../data/usecases/profiles"),
		]);
	const boot = await bootstrapData();
	// Locked (another tab) or broken storage: ownership cannot be proven, so personal books stay closed.
	if (boot.status === "locked") return "locked";
	if (boot.status !== "ready") return null;
	const profile = await resolveActiveProfile(boot.ctx);
	if (profile.kind === "guest" && !profile.mergedInto)
		return { all: true, keys: new Set() };
	return {
		all: false,
		keys: new Set(await listScanKeys(boot.ctx, profile.id)),
	};
}

/**
 * The active person's library entry id for a shelf book (catalog id or legacy scan id), if they
 * have one in SQLite. Lets the shelf card link to /library/:libraryBookId. Not cached.
 */
export async function libraryEntryFor(
	shelfId: string,
): Promise<string | undefined> {
	const [
		{ bootstrapData },
		{ listLibraryBooks, catalogClientKey, scanClientKey },
		{ resolveActiveProfile },
	] = await Promise.all([
		import("../data/bootstrap"),
		import("../data/usecases/libraryBooks"),
		import("../data/usecases/profiles"),
	]);
	const boot = await bootstrapData();
	if (boot.status !== "ready") return undefined;
	const profile = await resolveActiveProfile(boot.ctx);
	const keys = new Set([catalogClientKey(shelfId), scanClientKey(shelfId)]);
	return (await listLibraryBooks(boot.ctx, profile.id)).find((b) =>
		keys.has(b.clientKey),
	)?.id;
}

/** "locked": local storage is open in another tab, so ownership of a scan cannot be checked. */
export async function canOpenBook(id: string): Promise<boolean | "locked"> {
	if (isCatalogBook(id)) return true;
	cache ??= load().catch(() => null);
	const access = await cache;
	if (access === "locked") return "locked";
	return !!access && (access.all || access.keys.has(`scan:${id}`));
}
