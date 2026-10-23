import type { FileRouteTypes } from "../routeTree.gen";

/**
 * The BOOOKS page map: one typed list of every route the product talks about.
 *
 * Only `status: "live"` entries are ever rendered as links (primary nav, More page, desktop
 * footer). Their `path` is type-checked against the generated route tree, so a live link can
 * never point to a route that does not exist. "planned" (needs real behavior first) and
 * "needs-content" (needs approved copy first) entries document the map without looking live.
 * Kept free of React so it runs under `node --test`.
 */
export type LivePath = FileRouteTypes["to"];

export type NavPlacement = "primary" | "more" | "none";
export type NavGroup = "explore" | "reading" | "community";
/** immersive = fullscreen 3D world/overlay, no generic chrome; page = AppShell. */
export type Layout = "immersive" | "page";
/** world = shelves ⇄ Maps iris (sceneTransition); page = plain route change. */
export type TransitionClass = "world" | "page";
/** Which local data the page reads; "profile" pages must clear on a profile switch. */
export type DataScope = "none" | "device" | "profile";

type Common = {
	id: string;
	label: string;
	purpose: string;
	nav: NavPlacement;
	group?: NavGroup;
};
export type LiveRoute = Common & {
	status: "live";
	path: LivePath;
	layout: Layout;
	transition: TransitionClass;
	data: DataScope;
	offline: string;
};
export type PendingRoute = Common & {
	status: "planned" | "needs-content";
	/** Proposed path only; not registered with the router. */
	path: string;
	blockedBy: string;
};
export type RouteEntry = LiveRoute | PendingRoute;

const LIVE: LiveRoute[] = [
	{
		id: "library",
		status: "live",
		path: "/",
		label: "Library",
		purpose: "Your 3D shelves; open a book into the reader from here.",
		nav: "primary",
		group: "explore",
		layout: "immersive",
		transition: "world",
		data: "device",
		offline: "Works offline after the first visit (app shell precached).",
	},
	{
		id: "scan",
		status: "live",
		path: "/scan",
		label: "Scan",
		purpose: "Opens the existing camera scanner over your shelves.",
		nav: "primary",
		group: "explore",
		layout: "immersive",
		transition: "page",
		data: "device",
		offline:
			"Camera and cropping work offline; online book lookup needs a connection.",
	},
	{
		id: "maps",
		status: "live",
		path: "/maps",
		label: "Maps",
		purpose: "The Maps game world with your profile's books in the tornado.",
		nav: "primary",
		group: "explore",
		layout: "immersive",
		transition: "world",
		data: "profile",
		offline: "Falls back to the bundled offline map style.",
	},
	{
		id: "profile",
		status: "live",
		path: "/profile",
		label: "Profile",
		purpose: "Who is using this device, and the account connection state.",
		nav: "primary",
		layout: "page",
		transition: "page",
		data: "profile",
		offline: "Fully local.",
	},
	{
		id: "more",
		status: "live",
		path: "/more",
		label: "All pages",
		purpose: "Every secondary page, grouped (the mobile GIGA footer).",
		nav: "none",
		layout: "page",
		transition: "page",
		data: "none",
		offline: "Fully local.",
	},
	{
		id: "notes",
		status: "live",
		path: "/notes",
		label: "Notes",
		purpose: "Your offline notes for the active profile.",
		nav: "more",
		group: "reading",
		layout: "page",
		transition: "page",
		data: "profile",
		offline: "Fully local (SQLite).",
	},
	{
		id: "people",
		status: "live",
		path: "/people",
		label: "People & messages",
		purpose: "People on this device and same-device messages (opt-in).",
		nav: "more",
		group: "community",
		layout: "page",
		transition: "page",
		data: "profile",
		offline: "Fully local; nothing is sent to other devices.",
	},
	{
		id: "my-library",
		status: "live",
		path: "/library",
		label: "Your library",
		purpose:
			"Your own books: details, covers, page scans and what is saved on this device.",
		nav: "more",
		group: "reading",
		layout: "page",
		transition: "page",
		data: "profile",
		offline: "Fully local (SQLite + this device's file storage).",
	},
	{
		id: "book-manager",
		status: "live",
		path: "/library/$bookId",
		label: "Book manager",
		purpose:
			"One of your books by its stable library ID: details, content and local/sync status.",
		nav: "none",
		layout: "page",
		transition: "page",
		data: "profile",
		offline: "Fully local.",
	},
	// Opened from a book on the shelves (or a shared link); never a nav tab.
	{
		id: "book",
		status: "live",
		path: "/book/$bookId",
		label: "Book details",
		purpose:
			"A book's card over the shelves: public catalog books, or your own scans.",
		nav: "none",
		layout: "immersive",
		transition: "page",
		data: "device",
		offline:
			"Catalog details and this device's scans are local; covers load from cache.",
	},
	{
		id: "read",
		status: "live",
		path: "/read/$bookId",
		label: "Reader",
		purpose:
			"The existing reader for a book with an EPUB, PDF or scanned pages.",
		nav: "none",
		layout: "immersive",
		transition: "page",
		data: "device",
		offline:
			"Scanned pages read offline; catalog files need to have been opened online once.",
	},
];

const pending = (
	status: PendingRoute["status"],
	blockedBy: string,
	rows: readonly (readonly [id: string, path: string, label: string])[],
): PendingRoute[] =>
	rows.map(([id, path, label]) => ({
		id,
		status,
		path,
		label,
		purpose: label,
		nav: "none",
		blockedBy,
	}));

export const ROUTES: readonly RouteEntry[] = [
	...LIVE,
	// Needs real behavior before it can be linked. Discover is the intended 2nd primary tab.
	...pending("planned", "No working page or data behind it yet.", [
		["discover", "/discover", "Discover"],
		["search", "/search", "Search"],
		["collections", "/collections", "Collections"],
		["messages", "/messages", "Messages (separate route)"],
		["profile-edit", "/profile/edit", "Edit profile"],
		["settings", "/settings", "Settings"],
		["help", "/help", "Help"],
	]),
	// Needs approved copy: no legal terms, partner offers or API claims are invented here.
	...pending("needs-content", "Needs approved copy from the product owner.", [
		["about", "/about", "About BOOOKS"],
		["mission", "/mission", "Mission"],
		["how-it-works", "/how-it-works", "How it works"],
		["faq", "/faq", "FAQ"],
		["contact", "/contact", "Contact"],
		["accessibility", "/accessibility", "Accessibility"],
		["community-guidelines", "/community-guidelines", "Community guidelines"],
		["privacy", "/privacy", "Privacy"],
		["terms", "/terms", "Terms"],
		["for-libraries", "/for-libraries", "For libraries"],
		["for-publishers", "/for-publishers", "For authors & publishers"],
		["developers", "/developers", "Developers"],
	]),
];

export const GROUP_LABELS: Record<NavGroup, string> = {
	explore: "Explore",
	reading: "Reading",
	community: "Community",
};

export const isLive = (r: RouteEntry): r is LiveRoute => r.status === "live";

/** Primary destinations that exist today (planned ones are left out, never shown disabled). */
export function primaryLinks(): LiveRoute[] {
	return LIVE.filter((r) => r.nav === "primary");
}

/** GIGA footer / More page: live entries grouped; empty groups are omitted. */
export function moreGroups(): {
	group: NavGroup;
	label: string;
	links: LiveRoute[];
}[] {
	return (Object.keys(GROUP_LABELS) as NavGroup[])
		.map((group) => ({
			group,
			label: GROUP_LABELS[group],
			links: LIVE.filter((r) => r.group === group),
		}))
		.filter((g) => g.links.length > 0);
}

/** Proposed pages still waiting on behavior or content (shown as a plain, unlinked list). */
export function pendingRoutes(): PendingRoute[] {
	return ROUTES.filter((r): r is PendingRoute => r.status !== "live");
}
