import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { epub, file, pdf } from "./book-files-helpers.mjs";
import { A, B, page } from "./book-manager-helpers.mjs";
import { loadData, openCtx } from "./data-helpers.mjs";
import { legacyStore, scan } from "./library-helpers.mjs";

const data = await loadData();

async function setup(opts) {
	const o = await openCtx(data, opts);
	const guest = await data.ensureActiveProfile(o.ctx);
	const book = await data.addManualBook(o.ctx, guest.id, { title: "T" });
	return { ...o, guest, book };
}

test("nothing removed → nothing to free; plan is read-only", async () => {
	const { ctx, guest, book, files } = await setup();
	const p = await data.addPageScan(ctx, guest.id, book.id, page(A));
	const plan = await data.planStorageCleanup(ctx, guest.id);
	assert.deepEqual([plan.blobs.length, plan.totalBytes, plan.keptInUse], [0, 0, 0]);
	const r = await data.runStorageCleanup(ctx, guest.id, plan);
	assert.equal(r.freed, 0);
	assert.ok(await files.has(p.sha256));
});

test("frees only removed bytes nothing else uses; live, shared and cover bytes are kept", async () => {
	const { ctx, guest, book, files } = await setup();
	const other = await data.addManualBook(ctx, guest.id, { title: "Other" });
	const onlyHere = await data.addPageScan(ctx, guest.id, book.id, page(A));
	const shared = await data.addPageScan(ctx, guest.id, book.id, page(B));
	await data.addPageScan(ctx, guest.id, other.id, page(B)); // same bytes, still live elsewhere
	const doc = await data.importDigitalFile(ctx, guest.id, book.id, file(pdf()));
	for (const a of [onlyHere, shared, doc]) await data.removeAsset(ctx, guest.id, a.id);

	const plan = await data.planStorageCleanup(ctx, guest.id);
	assert.deepEqual(plan.blobs.map((b) => b.sha).sort(), [onlyHere.sha256, doc.sha256].sort());
	assert.equal(plan.keptInUse, 1, "the shared page is reported as kept");
	assert.equal(plan.totalBytes, onlyHere.byteSize + doc.byteSize);
	assert.ok(await files.has(onlyHere.sha256), "planning deletes nothing");

	const r = await data.runStorageCleanup(ctx, guest.id, plan);
	assert.deepEqual([r.freed, r.skipped, r.failed.length, r.planChanged], [2, 0, 0, false]);
	assert.ok(!(await files.has(onlyHere.sha256)) && !(await files.has(doc.sha256)));
	assert.ok(await files.has(shared.sha256), "bytes still used by a live page stay");
	assert.equal((await data.getBookOverview(ctx, guest.id, other.id)).status.localRecord, "saved");
	assert.equal((await data.planStorageCleanup(ctx, guest.id)).blobs.length, 0, "repeat is a no-op");
});

test("another profile's live use keeps the bytes; the plan exposes no other profile's data", async () => {
	const { ctx, guest, book, files } = await setup();
	const ben = await data.createLocalProfile(ctx, { displayName: "Ben" });
	const benBook = await data.addManualBook(ctx, ben.id, { title: "Ben's" });
	const mine = await data.addPageScan(ctx, guest.id, book.id, page(A));
	await data.addPageScan(ctx, ben.id, benBook.id, page(A)); // Ben has the same bytes
	await data.removeAsset(ctx, guest.id, mine.id);
	const plan = await data.planStorageCleanup(ctx, guest.id);
	assert.deepEqual([plan.blobs.length, plan.keptInUse], [0, 1]);
	assert.deepEqual(Object.keys(plan).sort(), ["blobs", "keptInUse", "token", "totalBytes"], "counts only");
	assert.equal((await data.planStorageCleanup(ctx, ben.id)).blobs.length, 0, "the guest's removals are not Ben's candidates");
	assert.ok(await files.has(mine.sha256));
});

test("a files row without a removed manifest (cover, merge copy) blocks deletion", async () => {
	const { ctx, guest, book, files } = await setup();
	await data.importLegacyScans(ctx, guest.id, legacyStore([scan("s1")]));
	const p = await data.addPageScan(ctx, guest.id, book.id, page(A)); // same bytes as a scan cover
	await data.removeAsset(ctx, guest.id, p.id);
	let plan = await data.planStorageCleanup(ctx, guest.id);
	assert.equal(plan.blobs.length, 0, "a cover still uses these bytes");
	const doc = await data.importDigitalFile(ctx, guest.id, book.id, file(epub()));
	await data.removeAsset(ctx, guest.id, doc.id);
	// A stray files row (e.g. a merge copy pointing at the bytes) is also proof of use.
	await ctx.database.write((db) =>
		db.run(sql`INSERT INTO files (id, profile_id, blob_key, mime_type, byte_size, created_at, updated_at) VALUES ('stray', ${guest.id}, ${doc.sha256}, 'application/epub+zip', 1, 1, 1)`),
	);
	plan = await data.planStorageCleanup(ctx, guest.id);
	assert.equal(plan.blobs.length, 0);
	assert.ok((await files.has(p.sha256)) && (await files.has(doc.sha256)));
});

test("plan recomputed at run time: a re-add after confirming keeps the bytes", async () => {
	const { ctx, guest, book, files } = await setup();
	const p = await data.addPageScan(ctx, guest.id, book.id, page(A));
	await data.removeAsset(ctx, guest.id, p.id);
	const plan = await data.planStorageCleanup(ctx, guest.id);
	assert.equal(plan.blobs.length, 1);
	await data.addPageScan(ctx, guest.id, book.id, page(A)); // restored before the person confirms
	const r = await data.runStorageCleanup(ctx, guest.id, plan);
	assert.deepEqual([r.freed, r.skipped, r.planChanged], [0, 1, true]);
	assert.ok(await files.has(p.sha256));
	assert.equal((await data.getBookOverview(ctx, guest.id, book.id)).status.localRecord, "saved");
});

test("a failing reference read deletes nothing (unavailable reference ≠ unused)", async () => {
	const { ctx, guest, book, files } = await setup();
	const p = await data.addPageScan(ctx, guest.id, book.id, page(A));
	await data.removeAsset(ctx, guest.id, p.id);
	const plan = await data.planStorageCleanup(ctx, guest.id);
	await ctx.database.write((db) => db.run(sql`ALTER TABLE notes RENAME TO notes_gone`));
	await assert.rejects(data.runStorageCleanup(ctx, guest.id, plan));
	assert.ok(await files.has(p.sha256), "bytes kept when a reference table cannot be read");
});

test("a store that cannot delete is reported as failed, never as freed", async () => {
	const inner = data.createMemoryFileStore();
	const sticky = { name: "sticky", put: inner.put, get: inner.get, has: inner.has, delete: async () => {} };
	const { ctx, guest, book } = await setup({ files: sticky });
	const p = await data.addPageScan(ctx, guest.id, book.id, page(A));
	await data.removeAsset(ctx, guest.id, p.id);
	const r = await data.runStorageCleanup(ctx, guest.id, await data.planStorageCleanup(ctx, guest.id));
	assert.deepEqual([r.freed, r.freedBytes, r.failed.length], [0, 0, 1]);
});

test("after cleanup, re-adding the same page or file stores the bytes again", async () => {
	const { ctx, guest, book, files } = await setup();
	const p = await data.addPageScan(ctx, guest.id, book.id, page(A));
	const d = await data.importDigitalFile(ctx, guest.id, book.id, file(pdf()));
	await data.removeAsset(ctx, guest.id, p.id);
	await data.removeAsset(ctx, guest.id, d.id);
	await data.runStorageCleanup(ctx, guest.id, await data.planStorageCleanup(ctx, guest.id));
	assert.ok(!(await files.has(p.sha256)) && !(await files.has(d.sha256)));
	await data.addPageScan(ctx, guest.id, book.id, page(A));
	await data.importDigitalFile(ctx, guest.id, book.id, file(pdf()));
	const o = await data.getBookOverview(ctx, guest.id, book.id);
	assert.deepEqual([o.pages[0].bytesOk, o.digitalFiles[0].bytesOk], [true, true]);
});

