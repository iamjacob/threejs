import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { createWebStore, loadData, openCtx, openDb } from "./data-helpers.mjs";
import { legacyStore, SENECA, scan } from "./library-helpers.mjs";

const data = await loadData();

test("0002 upgrades a populated 0001 database without touching existing rows", async () => {
	const store = createWebStore();
	const v1 = await openDb(data, store, data.migrations.slice(0, 2));
	await v1.database.write(async (db) => {
		await db.run(sql`INSERT INTO profiles VALUES ('g1','guest','Guest',NULL,NULL,1,1)`);
		await db.run(sql`INSERT INTO notes (id,profile_id,client_key,title,body,pinned,created_at,updated_at) VALUES ('n1','g1','k','Kept','',0,1,1)`);
	});
	await v1.database.close();
	const v2 = await openDb(data, store);
	assert.deepEqual(v2.result.applied, ["0002_library_books"]);
	const [{ c }] = await v2.database.queryRaw("SELECT count(*) AS c FROM notes");
	assert.equal(c, 1);
	const cols = (await v2.database.queryRaw("SELECT name FROM pragma_table_info('library_books')")).map((r) => r.name);
	for (const col of ["profile_id", "client_key", "catalog_id", "cover_front_file_id", "deleted_at"])
		assert.ok(cols.includes(col), col);
});

test("catalog books: explicit add only, idempotent, removable, not copied to new profiles", async () => {
	const { ctx } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	assert.deepEqual(await data.listLibraryBooks(ctx, guest.id), [], "the catalog is not auto-copied");
	const a = await data.addCatalogBook(ctx, guest.id, SENECA);
	const b = await data.addCatalogBook(ctx, guest.id, SENECA);
	assert.equal(a.id, b.id);
	const [row] = await data.listLibraryBooks(ctx, guest.id);
	assert.equal(row.source, "catalog");
	assert.equal(row.catalogId, SENECA.id);
	assert.equal(row.widthCm, 11);
	await data.removeLibraryBook(ctx, guest.id, a.id);
	assert.equal((await data.listLibraryBooks(ctx, guest.id)).length, 0);
	await data.addCatalogBook(ctx, guest.id, SENECA);
	const restored = await data.listLibraryBooks(ctx, guest.id);
	assert.equal(restored.length, 1);
	assert.equal(restored[0].id, a.id, "re-adding restores the same row");
});

test("profile isolation: another profile never sees or edits these books", async () => {
	const { ctx } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	await data.importLegacyScans(ctx, guest.id, legacyStore([scan("mine")]));
	const [book] = await data.listLibraryBooks(ctx, guest.id);
	await ctx.database.write((db) => db.run(sql`INSERT INTO profiles VALUES ('other','guest','Other',NULL,NULL,1,1)`));
	assert.deepEqual(await data.listLibraryBooks(ctx, "other"), []);
	await assert.rejects(data.removeLibraryBook(ctx, "other", book.id), { name: "NotFoundError" });
	assert.equal((await data.listLibraryBooks(ctx, guest.id)).length, 1);
});

test("offline read after restart: rows and cover bytes come from local storage", async () => {
	const store = createWebStore();
	const files = data.createMemoryFileStore();
	const a = await openCtx(data, { store, files });
	const guest = await data.ensureActiveProfile(a.ctx);
	await data.importLegacyScans(a.ctx, guest.id, legacyStore([scan("o1")]));
	await data.addCatalogBook(a.ctx, guest.id, SENECA);
	const b = await openCtx(data, { store, files }); // restart, nothing networked in the path
	const books = await data.listLibraryBooks(b.ctx, guest.id);
	assert.equal(books.length, 2);
	const scanned = books.find((x) => x.source === "scan");
	const { bytes } = await data.readFile(b.ctx, guest.id, scanned.coverFrontFileId);
	assert.ok(bytes?.length > 0);
});

test("guest → account merge copies books with remapped covers; duplicates are reported", async () => {
	const { ctx } = await openCtx(data);
	const old = await data.ensureActiveProfile(ctx);
	await data.addCatalogBook(ctx, old.id, SENECA);
	const accountId = (await data.promoteGuest(ctx, old.id, { kind: "new", displayName: "Ada" })).targetProfileId;
	await ctx.database.write((db) => db.run(data.sqlRaw("DELETE FROM app_state WHERE key = 'active_profile_id'")));
	const guest = await data.ensureActiveProfile(ctx);
	await data.addCatalogBook(ctx, guest.id, SENECA); // same catalog book in both → conflict
	await data.importLegacyScans(ctx, guest.id, legacyStore([scan("m1")]));

	const report = await data.promoteGuest(ctx, guest.id, { kind: "existing", profileId: accountId });
	assert.equal(report.booksCopied, 1);
	assert.equal(report.skippedBookConflicts.length, 1, "duplicate reported, not dropped silently");
	const acct = await data.listLibraryBooks(ctx, accountId);
	assert.equal(acct.length, 2);
	const copied = acct.find((b) => b.source === "scan");
	assert.equal(copied.covers.front?.profileId, accountId, "cover file id remapped to the account's row");
	assert.equal((await data.listLibraryBooks(ctx, guest.id)).length, 2, "guest rows are kept");
	const again = await data.promoteGuest(ctx, guest.id, { kind: "existing", profileId: accountId });
	assert.equal(again.alreadyCompleted, true);
	assert.equal((await data.listLibraryBooks(ctx, accountId)).length, 2, "retry copies nothing");
});
