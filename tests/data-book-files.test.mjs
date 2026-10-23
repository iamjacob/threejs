import assert from "node:assert/strict";
import { test } from "node:test";
import { epub, file, pdf, zip } from "./book-files-helpers.mjs";
import { flakyStore } from "./book-manager-helpers.mjs";
import { createWebStore, loadData, openCtx, openDb } from "./data-helpers.mjs";

const data = await loadData();

async function setup(opts) {
	const o = await openCtx(data, opts);
	const guest = await data.ensureActiveProfile(o.ctx);
	const book = await data.addManualBook(o.ctx, guest.id, { title: "Meditations" });
	return { ...o, guest, book };
}

test("0005 upgrades a 0004 database additively; rerun is a no-op", async () => {
	const store = createWebStore();
	const old = await openDb(data, store, data.migrations.slice(0, 5));
	await old.database.close();
	const v5 = await openDb(data, store);
	assert.deepEqual(v5.result.applied, ["0005_digital_files"]);
	const cols = (await v5.database.queryRaw("PRAGMA table_info(book_assets)")).map((c) => c.name);
	assert.ok(cols.includes("rights_basis") && cols.includes("source_note"));
	assert.deepEqual((await data.migrate(v5.database)).applied, []);
});

test("format is detected from the bytes: EPUB/PDF accepted, everything else refused, nothing written", async () => {
	assert.deepEqual(data.detectDigitalFormat(epub()), { ok: true, format: "epub" });
	assert.deepEqual(data.detectDigitalFormat(pdf()), { ok: true, format: "pdf" });
	assert.match(data.detectDigitalFormat(zip([["word/document.xml", "<w/>"]])).reason, /not an EPUB/);
	assert.match(data.detectDigitalFormat(zip([["mimetype", "application/epub+zip"]], { method: 8 })).reason, /not an EPUB/, "compressed mimetype is not OCF");
	assert.match(data.detectDigitalFormat(zip([["mimetype", "application/epub+zip"]], { withEnd: false })).reason, /incomplete/);
	assert.match(data.detectDigitalFormat(new TextEncoder().encode("%PDF-1.7\n1 0 obj")).reason, /incomplete/);
	assert.match(data.detectDigitalFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47])).reason, /not an EPUB or a PDF/);

	const { ctx, guest, book } = await setup();
	// A .pdf name and MIME on PNG bytes is still refused: the picker's label is only a hint.
	await assert.rejects(data.importDigitalFile(ctx, guest.id, book.id, file(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { mimeType: "application/pdf", originalName: "x.pdf" })), /not an EPUB or a PDF/);
	await assert.rejects(data.importDigitalFile(ctx, guest.id, book.id, file(new Uint8Array())), /empty/);
	const big = new Uint8Array(data.DIGITAL_MAX_BYTES + 1);
	big.set(pdf());
	await assert.rejects(data.importDigitalFile(ctx, guest.id, book.id, file(big)), /up to 20 MB/);
	await assert.rejects(data.importDigitalFile(ctx, guest.id, book.id, file(epub(), { rightsBasis: "found_online" })), /Choose why/);
	await assert.rejects(data.importDigitalFile(ctx, guest.id, book.id, file(epub(), { rightsBasis: "other", sourceNote: " " })), /Describe where/);
	const [{ c }] = await ctx.database.queryRaw("SELECT count(*) AS c FROM book_assets");
	assert.equal(c, 0, "refused files write no rows");
});

test("offline import: original bytes kept, hash verified, rights/provenance recorded, survives restart", async () => {
	const store = createWebStore();
	const files = data.createMemoryFileStore();
	const { ctx, guest, book } = await setup({ store, files });
	const bytes = epub("orig");
	const saved = await data.importDigitalFile(ctx, guest.id, book.id, file(bytes, { mimeType: "application/octet-stream", rightsNote: "PD in my country" }));
	assert.equal(saved.kind, "digital_file");
	assert.equal(saved.role, "epub");
	assert.equal(saved.mimeType, "application/epub+zip", "stored type comes from the detected format");
	assert.equal(saved.sha256, await data.sha256Hex(bytes));
	assert.deepEqual([saved.provenance, saved.rightsBasis, saved.sourceNote, saved.rightsNote], ["device_file", "public_domain", "Project Gutenberg", "PD in my country"]);
	assert.deepEqual(await files.get(saved.sha256), bytes, "byte-for-byte original");

	const after = await openCtx(data, { store, files }); // restart over the same persisted bytes
	const o = await data.getBookOverview(after.ctx, guest.id, book.id);
	assert.equal(o.digitalFiles.length, 1);
	assert.equal(o.digitalFiles[0].bytesOk, true);
	assert.equal(o.digitalFiles[0].originalName, "book.epub");
	assert.equal(o.status.content.kind, "none", "a digital file does not make page scans complete");
	assert.equal(o.status.localRecord, "saved");
	assert.deepEqual(o.status.remote.assets[saved.id], { kind: "not_configured" }, "Local only · sync not configured");
	const [{ c }] = await after.ctx.database.queryRaw("SELECT count(*) AS c FROM outbox");
	assert.equal(c, 0, "no fake queued sync work");
});

test("retry safety: same file twice, failed store then retry, remove then re-import → one row each", async () => {
	const inner = data.createMemoryFileStore();
	const flaky = flakyStore(inner);
	const { ctx, guest, book } = await setup({ files: flaky.store });
	const a = await data.importDigitalFile(ctx, guest.id, book.id, file(pdf("1")));
	const again = await data.importDigitalFile(ctx, guest.id, book.id, file(pdf("1"), { rightsBasis: "other", sourceNote: "changed" }));
	assert.equal(again.id, a.id);
	assert.equal(again.rightsBasis, "public_domain", "a retry never rewrites the first stated rights");
	await Promise.all([1, 2, 3].map(() => data.importDigitalFile(ctx, guest.id, book.id, file(pdf("1")))));

	flaky.state.failPut = true;
	await assert.rejects(data.importDigitalFile(ctx, guest.id, book.id, file(epub("2"))), /Disk full/);
	let o = await data.getBookOverview(ctx, guest.id, book.id);
	assert.equal(o.failed.length, 1);
	assert.equal(o.failed[0].kind, "digital_file");
	assert.equal(o.status.localRecord, "needs_attention");
	flaky.state.failPut = false;
	await data.importDigitalFile(ctx, guest.id, book.id, file(epub("2")));
	o = await data.getBookOverview(ctx, guest.id, book.id);
	assert.deepEqual([o.failed.length, o.digitalFiles.length], [0, 2]);

	await data.removeAsset(ctx, guest.id, a.id);
	assert.equal((await data.getBookOverview(ctx, guest.id, book.id)).digitalFiles.length, 1);
	assert.ok(await inner.has(a.sha256), "removal keeps the bytes");
	assert.equal((await data.importDigitalFile(ctx, guest.id, book.id, file(pdf("1")))).id, a.id, "re-import restores");
	const [{ c }] = await ctx.database.queryRaw("SELECT count(*) AS c FROM book_assets");
	assert.equal(c, 2);
});

test("hash verification: a store returning other bytes never yields a saved file", async () => {
	const inner = data.createMemoryFileStore();
	const lying = { name: "lying", put: (k, b) => inner.put(k, b), get: async () => pdf("other"), has: async () => true, delete: (k) => inner.delete(k) };
	const { ctx, guest, book } = await setup({ files: lying });
	await assert.rejects(data.importDigitalFile(ctx, guest.id, book.id, file(pdf())), { name: "IntegrityError" });
	const o = await data.getBookOverview(ctx, guest.id, book.id);
	assert.equal(o.digitalFiles.length, 0);
	assert.match(o.failed[0].lastError, /did not match/);
});

test("profile isolation: another person cannot import into, see or read this book's files", async () => {
	const { ctx, guest, book } = await setup();
	const saved = await data.importDigitalFile(ctx, guest.id, book.id, file(epub()));
	const ben = await data.createLocalProfile(ctx, { displayName: "Ben" });
	await assert.rejects(data.importDigitalFile(ctx, ben.id, book.id, file(pdf())), { name: "NotFoundError" });
	await assert.rejects(data.getBookOverview(ctx, ben.id, book.id), { name: "NotFoundError" });
	await assert.rejects(data.readAssetBytes(ctx, ben.id, saved.fileId), { name: "NotFoundError" });
	await assert.rejects(data.removeAsset(ctx, ben.id, saved.id), { name: "NotFoundError" });
});

