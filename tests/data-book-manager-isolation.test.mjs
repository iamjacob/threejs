import assert from "node:assert/strict";
import { test } from "node:test";
import { A, B, page } from "./book-manager-helpers.mjs";
import { loadData, openCtx } from "./data-helpers.mjs";
import { legacyStore, SENECA, scan } from "./library-helpers.mjs";

const data = await loadData();

test("profile isolation: another person cannot read, edit, add to or remove from this book", async () => {
	const { ctx } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	const book = await data.addManualBook(ctx, guest.id, { title: "Private" });
	const asset = await data.addPageScan(ctx, guest.id, book.id, page(A));
	const ben = await data.createLocalProfile(ctx, { displayName: "Ben" });
	await assert.rejects(data.getBookOverview(ctx, ben.id, book.id), { name: "NotFoundError" });
	await assert.rejects(data.updateBookMetadata(ctx, ben.id, book.id, { title: "x" }), { name: "NotFoundError" });
	await assert.rejects(data.addPageScan(ctx, ben.id, book.id, page(B)), { name: "NotFoundError" });
	await assert.rejects(data.removeAsset(ctx, ben.id, asset.id), { name: "NotFoundError" });
	await assert.rejects(data.readAssetBytes(ctx, ben.id, asset.fileId), { name: "NotFoundError" });
	assert.deepEqual(await data.listMyBooks(ctx, ben.id), []);
	assert.equal((await data.getBookOverview(ctx, guest.id, book.id)).book.title, "Private");
	const [{ c }] = await ctx.database.queryRaw("SELECT count(*) AS c FROM book_assets WHERE profile_id = ?", [ben.id]);
	assert.equal(c, 0);
});

test("existing scans and catalog books open in the manager; legacy records are kept", async () => {
	const { ctx } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	const legacy = legacyStore([scan("s1")]);
	await data.importLegacyScans(ctx, guest.id, legacy);
	await data.addCatalogBook(ctx, guest.id, SENECA);
	const books = await data.listMyBooks(ctx, guest.id);
	const scanned = books.find((b) => b.source === "scan");
	const catalog = books.find((b) => b.source === "catalog");
	const so = await data.getBookOverview(ctx, guest.id, scanned.id);
	assert.deepEqual(so.covers.map((c) => [c.face, c.source, c.bytesOk]), [["front", "file", true], ["back", "file", true]]);
	assert.deepEqual(so.status.content, { kind: "metadata_only", covers: 2 }, "covers alone are not book content");
	assert.equal(so.status.catalogIdentity, "unmatched");
	const co = await data.getBookOverview(ctx, guest.id, catalog.id);
	assert.equal(co.status.catalogIdentity, "candidate", "a bundled-catalog link is never 'verified' by the app");
	assert.equal(legacy.records.length, 1, "legacy records untouched");
});

test("the book manager writes no outbox rows (nothing can be sent; no fake queued work)", async () => {
	const { ctx } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	const [{ c: before }] = await ctx.database.queryRaw("SELECT count(*) AS c FROM outbox");
	const book = await data.addManualBook(ctx, guest.id, { title: "T" });
	await data.updateBookMetadata(ctx, guest.id, book.id, { title: "T2" });
	await data.addPageScan(ctx, guest.id, book.id, page(A));
	const [{ c: after }] = await ctx.database.queryRaw("SELECT count(*) AS c FROM outbox");
	assert.equal(after, before);
});

test("remote rules (for a future backend): synced only for the acknowledged revision/hash", () => {
	const ack = { entity: "library_book", entityId: "b", ackedRevision: 3, ackedSha256: null, ackedAt: 9 };
	assert.deepEqual(data.deriveRemote(false, ack, { revision: 3 }), { kind: "not_configured" }, "no target → never synced");
	assert.deepEqual(data.deriveRemote(true, undefined, { revision: 3 }), { kind: "local_only" });
	assert.deepEqual(data.deriveRemote(true, ack, { revision: 3 }), { kind: "synced", at: 9 });
	assert.deepEqual(data.deriveRemote(true, ack, { revision: 4 }), { kind: "changed_since_sync" }, "an edit after sync is not 'synced'");
	const asset = { entity: "book_asset", entityId: "a", ackedRevision: null, ackedSha256: "aa", ackedAt: 1 };
	assert.deepEqual(data.deriveRemote(true, asset, { sha256: "bb" }), { kind: "changed_since_sync" }, "bytes are independent of metadata");
});
