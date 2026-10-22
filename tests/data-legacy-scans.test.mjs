import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData, openCtx } from "./data-helpers.mjs";
import { legacyStore, PNG_B, scan } from "./library-helpers.mjs";

const data = await loadData();

test("import: guest only; covers to FileStore; file refs in SQLite; originals kept", async () => {
	const { ctx, files, driver } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	const legacy = legacyStore([scan("s1"), scan("s2", { cover: { front: PNG_B } })]);
	const r1 = await data.importLegacyScans(ctx, guest.id, legacy);
	assert.deepEqual(r1.imported.sort(), ["s1", "s2"]);
	assert.deepEqual(r1.failed, []);
	assert.equal(legacy.records.length, 2, "legacy records untouched");
	assert.equal(legacy.marks.get("s1"), guest.id, "marked imported only after verification");

	const s1 = (await data.listLibraryBooks(ctx, guest.id)).find((b) => b.clientKey === "scan:s1");
	assert.ok(s1.covers.front && s1.covers.back);
	assert.equal(s1.coverSpineFileId, null, "non-embedded (blob:) spine is not fetched");
	assert.ok(await files.has(s1.covers.front.blobKey));
	assert.equal(Math.round(s1.widthCm), 12, "world units (×30) → cm");
	const rows = await driver.query("SELECT * FROM library_books", []);
	assert.ok(
		rows.every((r) => Object.values(r).every((v) => typeof v !== "string" || !v.startsWith("data:"))),
		"no data URLs stored in SQLite",
	);
});

test("import is idempotent, including when markers are lost after commit", async () => {
	const { ctx } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	const legacy = legacyStore([scan("s1"), scan("s2")]);
	await data.importLegacyScans(ctx, guest.id, legacy);
	const r2 = await data.importLegacyScans(ctx, guest.id, legacy);
	assert.deepEqual(r2.imported, []);
	assert.deepEqual(r2.alreadyImported.sort(), ["s1", "s2"]);
	legacy.marks.clear();
	const r3 = await data.importLegacyScans(ctx, guest.id, legacy);
	assert.deepEqual(r3.imported.sort(), ["s1", "s2"], "re-verified and re-marked");
	assert.equal((await data.listLibraryBooks(ctx, guest.id)).length, 2, "no duplicate books");
	const [{ c }] = await ctx.database.queryRaw("SELECT count(*) AS c FROM files");
	assert.equal(c, 4, "no duplicate file rows (2 scans × front+back)");
});

test("a crash during the SQLite write is recovered by re-running", async () => {
	const { ctx } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	const legacy = legacyStore([scan("c1")]);
	const realWrite = ctx.database.write.bind(ctx.database);
	ctx.database.write = async () => {
		throw new Error("simulated crash");
	};
	const failed = await data.importLegacyScans(ctx, guest.id, legacy);
	assert.equal(failed.failed[0].id, "c1");
	assert.equal(legacy.marks.size, 0, "nothing marked");
	ctx.database.write = realWrite;
	const ok = await data.importLegacyScans(ctx, guest.id, legacy);
	assert.deepEqual(ok.imported, ["c1"]);
});

test("missing cover bytes fail verification and leave the record unmarked", async () => {
	const { ctx, files } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	const legacy = legacyStore([scan("v1")]);
	const realPut = files.put.bind(files);
	files.put = async () => {}; // storage silently drops bytes (e.g. quota / eviction)
	const r = await data.importLegacyScans(ctx, guest.id, legacy);
	assert.match(r.failed[0]?.reason ?? "", /verification/);
	assert.equal(legacy.marks.size, 0);
	files.put = realPut;
	assert.deepEqual((await data.importLegacyScans(ctx, guest.id, legacy)).imported, ["v1"]);
});

test("bad scans are reported, not dropped; never imported into an account profile", async () => {
	const { ctx } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	const legacy = legacyStore([
		scan("ok"),
		scan("nofront", { cover: { front: "/blockchain/x.webp" } }),
		scan("notitle", { title: "  " }),
		{ title: "no id" },
	]);
	const report = await data.importLegacyScans(ctx, guest.id, legacy);
	assert.deepEqual(report.imported, ["ok"]);
	assert.deepEqual(report.failed.map((f) => f.id).sort(), ["nofront", "notitle", "undefined"]);
	assert.ok(!legacy.marks.has("nofront"));

	const { targetProfileId } = await data.promoteGuest(ctx, guest.id, { kind: "new", displayName: "Ada" });
	const later = legacyStore([scan("later")]);
	const skipped = await data.importLegacyScans(ctx, targetProfileId, later);
	assert.equal(skipped.status, "skipped_not_guest");
	assert.equal(later.marks.size, 0);
	const merged = await data.importLegacyScans(ctx, guest.id, later);
	assert.equal(merged.status, "skipped_not_guest", "a merged guest is archived; no new imports");
});

test("decodeImageDataUrl only accepts embedded images", () => {
	assert.ok(data.decodeImageDataUrl(PNG_B));
	for (const v of [undefined, "", "https://x/y.png", "/blockchain/a.webp", "data:text/plain;base64,AA==", "data:image/png;base64,!!"])
		assert.equal(data.decodeImageDataUrl(v), undefined, String(v));
});
