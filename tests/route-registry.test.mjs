import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { ROUTES, primaryLinks, moreGroups, pendingRoutes, isLive } = await import(
	"../src/lib/routeRegistry.ts"
);

// The router's real paths, read from the generated tree (the source the app is built from).
const tree = readFileSync(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8");
const byFullPath = tree.match(/interface FileRoutesByFullPath \{([^}]*)\}/)[1];
// Index routes appear as '/x/' in full paths but are linked as '/x'; accept both forms.
const registered = new Set(
	[...byFullPath.matchAll(/'([^']+)':/g)].flatMap((m) => (m[1].length > 1 && m[1].endsWith("/") ? [m[1], m[1].slice(0, -1)] : [m[1]])),
);

test("the router path list was read (guards the parser above)", () => {
	for (const p of ["/", "/maps", "/scan", "/notes", "/people", "/profile", "/more", "/book/$bookId", "/read/$bookId"])
		assert.ok(registered.has(p), `${p} parsed from routeTree.gen.ts`);
});

test("every visible link (primary, More, footer) targets a registered route", () => {
	const visible = [...primaryLinks(), ...moreGroups().flatMap((g) => g.links)];
	assert.ok(visible.length > 0);
	for (const r of visible) {
		assert.equal(r.status, "live", `${r.id} is live`);
		assert.ok(registered.has(r.path), `${r.id} → ${r.path} is a router path`);
	}
	for (const r of ROUTES.filter(isLive))
		assert.ok(registered.has(r.path), `live ${r.id} (${r.path}) exists in the router`);
});

test("primary navigation: at most five, in the product order, never Reader/People/Messages/legal", () => {
	const ids = primaryLinks().map((r) => r.id);
	assert.ok(ids.length <= 5);
	assert.deepEqual(ids, ["library", "scan", "maps", "profile"], "Discover is held back until it works");
	for (const banned of ["read", "people", "messages", "notes", "privacy", "terms", "settings"])
		assert.ok(!ids.includes(banned), `${banned} is not a primary tab`);
});

test("Maps is /maps; /play is gone from the router and the registry", () => {
	assert.equal(ROUTES.find((r) => r.id === "maps").path, "/maps");
	assert.ok(registered.has("/maps"));
	assert.ok(!registered.has("/play"), "no /play route or alias");
	assert.ok(!ROUTES.some((r) => r.path === "/play" || /play/i.test(r.label)));
});

test("planned and needs-content pages are never links, and never claim to be live", () => {
	const pending = pendingRoutes();
	assert.ok(pending.length > 0);
	for (const r of pending) {
		assert.notEqual(r.status, "live");
		assert.ok(r.blockedBy.length > 0, `${r.id} says why it is not available`);
		assert.ok(!registered.has(r.path), `${r.id} (${r.path}) is not secretly registered`);
	}
	for (const id of ["privacy", "terms", "developers", "for-libraries"])
		assert.equal(ROUTES.find((r) => r.id === id).status, "needs-content");
});

test("book and reader are real routes, opened from a book (never a nav tab)", () => {
	for (const id of ["book", "read"]) {
		const r = ROUTES.find((x) => x.id === id);
		assert.equal(r.status, "live");
		assert.equal(r.nav, "none");
		assert.equal(r.layout, "immersive", "they render over the shelves, not in the page shell");
	}
});

test("ids are unique; profile-scoped pages are marked so they clear on a switch", () => {
	const ids = ROUTES.map((r) => r.id);
	assert.equal(new Set(ids).size, ids.length);
	for (const id of ["maps", "notes", "people", "profile"])
		assert.equal(ROUTES.find((r) => r.id === id).data, "profile");
});
