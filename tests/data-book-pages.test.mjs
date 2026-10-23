import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { A, B, C, page } from "./book-manager-helpers.mjs";
import { createWebStore, loadData, openCtx } from "./data-helpers.mjs";

const data = await loadData();

async function threePages(opts) {
	const o = await openCtx(data, opts);
	const guest = await data.ensureActiveProfile(o.ctx);
	const book = await data.addManualBook(o.ctx, guest.id, { title: "T" });
	const pa = await data.addPageScan(o.ctx, guest.id, book.id, page(A));
	const pb = await data.addPageScan(o.ctx, guest.id, book.id, page(B));
	const pc = await data.addPageScan(o.ctx, guest.id, book.id, page(C));
	return { ...o, guest, book, pa, pb, pc };
}

test("explicit numbering: conflict refused, explicit swap trades numbers, persisted across restart", async () => {
	const store = createWebStore();
	const files = data.createMemoryFileStore();
	const { ctx, guest, book, pa, pb, pc } = await threePages({ store, files });
	await assert.rejects(data.setPageNumber(ctx, guest.id, pc.id, 1), { name: "PageConflictError", message: /Page 1 already has a scan/ });
	await assert.rejects(data.setPageNumber(ctx, guest.id, pc.id, 0), /whole number/);
	await assert.rejects(data.setPageNumber(ctx, guest.id, pc.id, 1.5), /whole number/);
	await data.setPageNumber(ctx, guest.id, pc.id, 1, { swap: true });
	await data.setPageNumber(ctx, guest.id, pa.id, 6); // leaves a gap
	const after = await openCtx(data, { store, files });
	const o = await data.getBookOverview(after.ctx, guest.id, book.id);
	assert.deepEqual(o.pages.map((p) => [p.id, p.pageIndex]), [[pc.id, 0], [pb.id, 1], [pa.id, 5]]);
	assert.deepEqual(o.pageIssues, { duplicates: [], missing: [3, 4, 5] }, "gaps are reported 1-based");
	assert.equal(o.book.metadataRevision, 3, "each change bumps the revision once");
	await data.setPageNumber(after.ctx, guest.id, pa.id, 6);
	assert.equal((await data.getBookOverview(after.ctx, guest.id, book.id)).book.metadataRevision, 3, "no-op keeps the revision");
});

test("pageNumberIssues: gaps up to the larger of the expected count and the highest page", () => {
	const at = (...ix) => ix.map((pageIndex) => ({ pageIndex }));
	assert.deepEqual(data.pageNumberIssues(at(0, 3), 2), { duplicates: [], missing: [2, 3] }, "page 3 is missing even past an expected count of 2");
	assert.deepEqual(data.pageNumberIssues(at(0, 1), 4), { duplicates: [], missing: [3, 4] });
	assert.deepEqual(data.pageNumberIssues(at(0, 0, 1), null), { duplicates: [1], missing: [] });
	assert.deepEqual(data.pageNumberIssues([], null), { duplicates: [], missing: [] });
});

test("reorder: move up/down swaps with the neighbour; ends are refused clearly", async () => {
	const { ctx, guest, book, pa, pb, pc } = await threePages();
	await data.movePage(ctx, guest.id, pc.id, -1);
	let o = await data.getBookOverview(ctx, guest.id, book.id);
	assert.deepEqual(o.pages.map((p) => p.id), [pa.id, pc.id, pb.id]);
	await data.movePage(ctx, guest.id, pa.id, 1);
	o = await data.getBookOverview(ctx, guest.id, book.id);
	assert.deepEqual(o.pages.map((p) => [p.id, p.pageIndex]), [[pc.id, 0], [pa.id, 1], [pb.id, 2]]);
	await assert.rejects(data.movePage(ctx, guest.id, pc.id, -1), /already the first page/);
	await assert.rejects(data.movePage(ctx, guest.id, pb.id, 1), /already the last page/);
});

test("duplicate numbers (e.g. older data) are flagged and can be separated", async () => {
	const { ctx, guest, book, pa, pb } = await threePages();
	await ctx.database.write((db) => db.run(sql`UPDATE book_assets SET page_index = 0 WHERE id = ${pb.id}`));
	let o = await data.getBookOverview(ctx, guest.id, book.id);
	assert.deepEqual(o.pageIssues, { duplicates: [1], missing: [2] });
	assert.equal(o.status.localRecord, "needs_attention");
	assert.ok(o.status.attention.some((a) => /share a page number/.test(a)));
	await data.setPageNumber(ctx, guest.id, pa.id, 1); // already page 1: a no-op, not an error
	await assert.rejects(data.setPageNumber(ctx, guest.id, o.pages[2].id, 1, { swap: true }), /more than one scan/, "no ambiguous swap");
	const second = o.pages[1].id;
	await data.movePage(ctx, guest.id, second, 1);
	o = await data.getBookOverview(ctx, guest.id, book.id);
	assert.deepEqual(o.pageIssues, { duplicates: [], missing: [] });
	assert.equal(o.status.localRecord, "saved");
});

test("page tools are profile-scoped and ignore removed pages", async () => {
	const { ctx, guest, pa, pb } = await threePages();
	const ben = await data.createLocalProfile(ctx, { displayName: "Ben" });
	await assert.rejects(data.setPageNumber(ctx, ben.id, pa.id, 9), { name: "NotFoundError" });
	await assert.rejects(data.movePage(ctx, ben.id, pa.id, 1), { name: "NotFoundError" });
	await data.removeAsset(ctx, guest.id, pb.id);
	await assert.rejects(data.setPageNumber(ctx, guest.id, pb.id, 9), { name: "NotFoundError" });
	await data.setPageNumber(ctx, guest.id, pa.id, 2, { swap: true }); // the removed page 2 is not a conflict
	const [{ c }] = await ctx.database.queryRaw("SELECT count(*) AS c FROM outbox");
	assert.equal(c, 0);
});
