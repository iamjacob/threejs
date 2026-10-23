import assert from "node:assert/strict";
import { test } from "node:test";
import { A, B, flakyStore, page } from "./book-manager-helpers.mjs";
import { loadData, openCtx } from "./data-helpers.mjs";

const data = await loadData();

test("failed import shows why and survives as 'needs attention'; retry saves exactly once", async () => {
	const inner = data.createMemoryFileStore();
	const flaky = flakyStore(inner);
	const { ctx } = await openCtx(data, { files: flaky.store });
	const guest = await data.ensureActiveProfile(ctx);
	const book = await data.addManualBook(ctx, guest.id, { title: "T" });
	flaky.state.failPut = true;
	await assert.rejects(data.addPageScan(ctx, guest.id, book.id, page(A)), /Disk full/);
	let o = await data.getBookOverview(ctx, guest.id, book.id);
	assert.equal(o.failed.length, 1);
	assert.equal(o.failed[0].lastError, "Disk full");
	assert.equal(o.status.localRecord, "needs_attention");
	assert.equal(o.status.content.kind, "none", "a failed import is not content");
	flaky.state.failPut = false;
	await data.addPageScan(ctx, guest.id, book.id, page(A));
	o = await data.getBookOverview(ctx, guest.id, book.id);
	assert.equal(o.failed.length, 0);
	assert.equal(o.pages.length, 1);
	assert.equal(o.status.localRecord, "saved");
	const [{ c }] = await ctx.database.queryRaw("SELECT count(*) AS c FROM book_assets");
	assert.equal(c, 1, "failed + retried = one manifest row");
	await inner.delete(o.pages[0].sha256); // bytes lost (e.g. site data cleared)
	o = await data.getBookOverview(ctx, guest.id, book.id);
	assert.equal(o.status.localRecord, "needs_attention");
	assert.equal(o.status.content.kind, "none", "missing bytes are not counted as content");
});

test("integrity: a store that returns other bytes never yields a saved page", async () => {
	const inner = data.createMemoryFileStore();
	const lying = { name: "lying", put: (k, b) => inner.put(k, b), get: async () => B, has: async () => true, delete: (k) => inner.delete(k) };
	const { ctx } = await openCtx(data, { files: lying });
	const guest = await data.ensureActiveProfile(ctx);
	const book = await data.addManualBook(ctx, guest.id, { title: "T" });
	await assert.rejects(data.addPageScan(ctx, guest.id, book.id, page(A)), { name: "IntegrityError" });
	const o = await data.getBookOverview(ctx, guest.id, book.id);
	assert.equal(o.pages.length, 0);
	assert.equal(o.failed[0].lastError, "The saved image did not match what was picked");
});

test("unsupported formats are refused honestly; removal keeps the bytes and re-adding restores", async () => {
	const { ctx, files } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	const book = await data.addManualBook(ctx, guest.id, { title: "T" });
	await assert.rejects(data.addPageScan(ctx, guest.id, book.id, { ...page(A), mimeType: "application/pdf" }), /not supported/);
	await assert.rejects(data.addPageScan(ctx, guest.id, book.id, page(new Uint8Array())), /between 1 byte/);
	const saved = await data.addPageScan(ctx, guest.id, book.id, page(A));
	await data.removeAsset(ctx, guest.id, saved.id);
	assert.equal((await data.getBookOverview(ctx, guest.id, book.id)).pages.length, 0);
	assert.ok(await files.has(saved.sha256), "removal never deletes the only copy");
	const again = await data.addPageScan(ctx, guest.id, book.id, page(A));
	assert.equal(again.id, saved.id, "re-adding restores the same asset");
	assert.equal((await data.getBookOverview(ctx, guest.id, book.id)).pages.length, 1);
});

test("validation: metadata edits refuse empty titles, odd ISBNs and impossible page counts", async () => {
	const { ctx } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	const book = await data.addManualBook(ctx, guest.id, { title: "T" });
	await assert.rejects(data.updateBookMetadata(ctx, guest.id, book.id, { title: "  " }), /Title is required/);
	await assert.rejects(data.updateBookMetadata(ctx, guest.id, book.id, { isbn: "abc" }), /ISBN/);
	await assert.rejects(data.updateBookMetadata(ctx, guest.id, book.id, { expectedPageCount: 0 }), /Page count/);
	await assert.rejects(data.updateBookMetadata(ctx, guest.id, book.id, { expectedPageCount: 2.5 }), /Page count/);
	const cleared = await data.updateBookMetadata(ctx, guest.id, book.id, { isbn: "", expectedPageCount: null });
	assert.equal(cleared.isbn, null);
	assert.equal((await data.getBookOverview(ctx, guest.id, book.id)).book.title, "T", "a refused edit changes nothing");
});
