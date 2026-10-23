import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebStore, loadData, openCtx } from "./data-helpers.mjs";

const data = await loadData();
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

test("first launch creates one durable guest; restart reuses it", async () => {
	const store = createWebStore();
	const a = await openCtx(data, { store });
	const guest = await data.ensureActiveProfile(a.ctx);
	assert.equal(guest.kind, "guest");
	assert.equal((await data.ensureActiveProfile(a.ctx)).id, guest.id, "idempotent");
	const b = await openCtx(data, { store }); // restart
	assert.equal((await data.ensureActiveProfile(b.ctx)).id, guest.id);
	assert.equal((await data.listProfiles(b.ctx)).length, 1);
});

test("CRUD: create, list, update, soft delete, and data survives restart", async () => {
	const store = createWebStore();
	const a = await openCtx(data, { store });
	const { id: pid } = await data.ensureActiveProfile(a.ctx);
	const n1 = await data.createNote(a.ctx, pid, { title: "  First  ", body: "hello" });
	a.advance(10);
	const n2 = await data.createNote(a.ctx, pid, { title: "Second" });
	assert.equal(n1.title, "First", "title is trimmed");
	assert.deepEqual((await data.listNotes(a.ctx, pid)).map((n) => n.id), [n2.id, n1.id], "newest first");

	a.advance(10);
	await data.updateNote(a.ctx, pid, n1.id, { body: "edited", pinned: true });
	a.advance(10);
	await data.deleteNote(a.ctx, pid, n2.id);
	await data.deleteNote(a.ctx, pid, n2.id); // second delete is a no-op

	const b = await openCtx(data, { store }); // restart
	const after = await data.listNotes(b.ctx, pid);
	assert.equal(after.length, 1);
	assert.equal(after[0].body, "edited");
	assert.equal(after[0].pinned, true);
	await assert.rejects(data.updateNote(b.ctx, pid, n2.id, { title: "x" }), { name: "NotFoundError" });
});

test("validation errors are raised by use cases, before any write", async () => {
	const { ctx } = await openCtx(data);
	const { id: pid } = await data.ensureActiveProfile(ctx);
	await assert.rejects(data.createNote(ctx, pid, { title: "   " }), { name: "ValidationError" });
	await assert.rejects(data.createNote(ctx, pid, { title: "x".repeat(121) }), { name: "ValidationError" });
	await assert.rejects(data.createNote(ctx, pid, { title: "ok", body: "x".repeat(10_001) }), { name: "ValidationError" });
	assert.equal((await data.listNotes(ctx, pid)).length, 0);
	assert.equal((await data.pendingOutbox(ctx, pid)).length, 0);
});

test("createNote with the same clientKey is idempotent (double-submit safe)", async () => {
	const { ctx } = await openCtx(data);
	const { id: pid } = await data.ensureActiveProfile(ctx);
	const a = await data.createNote(ctx, pid, { title: "Once", clientKey: "tap-1" });
	const b = await data.createNote(ctx, pid, { title: "Once", clientKey: "tap-1" });
	assert.equal(a.id, b.id);
	assert.equal((await data.listNotes(ctx, pid)).length, 1);
	assert.equal((await data.pendingOutbox(ctx, pid)).length, 1);
});

test("profile isolation: another profile's rows are never visible or editable", async () => {
	const { ctx } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	const report = await data.promoteGuest(ctx, guest.id, { kind: "new", displayName: "Ada" });
	const other = await data.ensureActiveProfile(ctx); // active is now the account
	assert.equal(other.id, report.targetProfileId);
	const secret = await data.createNote(ctx, other.id, { title: "Account only" });
	assert.equal((await data.listNotes(ctx, guest.id)).length, 0);
	await assert.rejects(data.updateNote(ctx, guest.id, secret.id, { title: "hijack" }), { name: "NotFoundError" });
	await assert.rejects(data.deleteNote(ctx, guest.id, secret.id), { name: "NotFoundError" });
	assert.equal((await data.listNotes(ctx, other.id))[0].title, "Account only");
});

test("files: bytes go to the FileStore, SQLite keeps only metadata + content key", async () => {
	const { ctx, files, driver } = await openCtx(data);
	const { id: pid } = await data.ensureActiveProfile(ctx);
	const note = await data.createNote(ctx, pid, { title: "With image" });
	const updated = await data.attachImage(ctx, pid, note.id, { bytes: png, mimeType: "image/png", width: 2, height: 2 });
	const { record, bytes, missing } = await data.readFile(ctx, pid, updated.fileId);
	assert.equal(missing, false);
	assert.deepEqual(bytes, png);
	assert.equal(record.blobKey, await data.sha256Hex(png));
	assert.equal(record.byteSize, png.byteLength);
	const columns = await driver.query("SELECT * FROM files", []);
	assert.ok(columns.every((row) => Object.values(row).every((v) => !(v instanceof Uint8Array))), "no blobs in SQLite");
	assert.equal(await files.has(record.blobKey), true);
	await assert.rejects(data.attachImage(ctx, pid, note.id, { bytes: png, mimeType: "application/pdf" }), { name: "ValidationError" });
	await assert.rejects(data.readFile(ctx, "someone-else", updated.fileId), { name: "NotFoundError" });
});

test("files: missing bytes (e.g. cleared storage) are reported, not hidden", async () => {
	const { ctx, files } = await openCtx(data);
	const { id: pid } = await data.ensureActiveProfile(ctx);
	const note = await data.createNote(ctx, pid, { title: "img" });
	const { fileId } = await data.attachImage(ctx, pid, note.id, { bytes: png, mimeType: "image/png" });
	await files.delete(await data.sha256Hex(png));
	const result = await data.readFile(ctx, pid, fileId);
	assert.equal(result.missing, true);
});
