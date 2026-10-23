import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { A, B, C, page } from "./book-manager-helpers.mjs";
import { createWebStore, loadData, openCtx, openDb } from "./data-helpers.mjs";

const data = await loadData();

test("0004 upgrades a populated 0003 database: rows kept, catalog rows 'candidate', scans 'unmatched'", async () => {
	const store = createWebStore();
	const old = await openDb(data, store, data.migrations.slice(0, 4));
	const ctx0 = { database: old.database, files: data.createMemoryFileStore(), clock: () => 5, newId: () => "x1" };
	const guest = await data.ensureActiveProfile(ctx0);
	await old.database.write((db) =>
		db.run(sql`INSERT INTO library_books (id,profile_id,client_key,source,catalog_id,title,author,added_at,created_at,updated_at)
			VALUES ('b1',${guest.id},'catalog:c1','catalog','c1','Cat','',1,1,1), ('b2',${guest.id},'scan:s1','scan',NULL,'Scan','',2,2,2)`),
	);
	await old.database.close();
	const v4 = await openDb(data, store);
	assert.deepEqual(v4.result.applied, ["0004_book_manager", "0005_digital_files"]);
	const rows = await v4.database.queryRaw(
		"SELECT id, title, catalog_match, metadata_revision, expected_page_count FROM library_books ORDER BY id",
	);
	assert.deepEqual(
		rows.map((r) => [r.id, r.title, r.catalog_match, r.metadata_revision, r.expected_page_count]),
		[["b1", "Cat", "candidate", 1, null], ["b2", "Scan", "unmatched", 1, null]],
	);
	assert.deepEqual((await data.migrate(v4.database)).applied, [], "rerun is a no-op");
});

test("guest, offline: add a book, edit metadata, add a page; survives restart; nothing reads as synced", async () => {
	const store = createWebStore();
	const files = data.createMemoryFileStore();
	const a = await openCtx(data, { store, files });
	const guest = await data.ensureActiveProfile(a.ctx);
	const book = await data.addManualBook(a.ctx, guest.id, { title: "  Field notes ", author: "Me", clientKey: "k1" });
	const again = await data.addManualBook(a.ctx, guest.id, { title: "Field notes", clientKey: "k1" });
	assert.equal(again.id, book.id, "a retried add is one book");
	const edited = await data.updateBookMetadata(a.ctx, guest.id, book.id, { subtitle: "Vol 1", isbn: "978-0-14-101881-2", expectedPageCount: 2 });
	assert.equal(edited.metadataRevision, 2);
	const noop = await data.updateBookMetadata(a.ctx, guest.id, book.id, { subtitle: "Vol 1" });
	assert.equal(noop.metadataRevision, 2, "an edit that changes nothing keeps the revision");
	await data.addPageScan(a.ctx, guest.id, book.id, page(A));
	const b = await openCtx(data, { store, files }); // restart over the same persisted bytes
	const o = await data.getBookOverview(b.ctx, guest.id, book.id);
	assert.equal(o.book.title, "Field notes");
	assert.equal(o.book.subtitle, "Vol 1");
	assert.equal(o.pages.length, 1);
	assert.deepEqual(o.status.content, { kind: "partial", pages: 1, expected: 2, missing: [1] });
	assert.equal(o.status.localRecord, "saved");
	assert.deepEqual(o.status.remote.metadata, { kind: "not_configured" });
	assert.ok(Object.values(o.status.remote.assets).every((r) => r.kind === "not_configured"));
	assert.equal(o.status.publicRegistration, "not_proposed");
	assert.equal(o.status.chainPublication, "not_submitted");
	const [{ c }] = await b.ctx.database.queryRaw("SELECT count(*) AS c FROM sync_states");
	assert.equal(c, 0, "no fake acknowledgements are persisted");
});

test("complete only with an expected count and every page; the same image twice is one page", async () => {
	const { ctx } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	const book = await data.addManualBook(ctx, guest.id, { title: "T" });
	await data.addPageScan(ctx, guest.id, book.id, page(A));
	await data.addPageScan(ctx, guest.id, book.id, page(B));
	let o = await data.getBookOverview(ctx, guest.id, book.id);
	assert.equal(o.status.content.kind, "partial", "no expected count → never 'complete'");
	assert.equal(o.status.content.expected, null);
	await data.addPageScan(ctx, guest.id, book.id, page(A));
	o = await data.getBookOverview(ctx, guest.id, book.id);
	assert.deepEqual(o.pages.map((p) => p.pageIndex), [0, 1], "the same bytes are stored once");
	await data.updateBookMetadata(ctx, guest.id, book.id, { expectedPageCount: 2 });
	assert.deepEqual((await data.getBookOverview(ctx, guest.id, book.id)).status.content, { kind: "complete", pages: 2, expected: 2 });
	await data.updateBookMetadata(ctx, guest.id, book.id, { expectedPageCount: 3 });
	assert.deepEqual((await data.getBookOverview(ctx, guest.id, book.id)).status.content.missing, [2]);
	await assert.rejects(data.addPageScan(ctx, guest.id, book.id, page(C, { pageIndex: 1 })), /already has a scan/);
	await data.addPageScan(ctx, guest.id, book.id, page(C, { pageIndex: 2 }));
	assert.equal((await data.getBookOverview(ctx, guest.id, book.id)).status.content.kind, "complete");
});
