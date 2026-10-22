import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { createWebStore, loadData, openCtx, openDb } from "./data-helpers.mjs";
import { SENECA } from "./library-helpers.mjs";
import { device } from "./shared-device-helpers.mjs";

const data = await loadData();

test("0003 upgrades a populated 0002 database; guest data and books kept; rerun is a no-op", async () => {
	const store = createWebStore();
	const v2 = await openDb(data, store, data.migrations.slice(0, 3));
	await v2.database.write(async (db) => {
		await db.run(sql`INSERT INTO profiles VALUES ('g1','guest','Guest',NULL,NULL,1,1)`);
		await db.run(sql`INSERT INTO app_state VALUES ('active_profile_id','g1')`);
		await db.run(sql`INSERT INTO notes (id,profile_id,client_key,title,body,pinned,created_at,updated_at) VALUES ('n1','g1','k','Kept','',0,1,1)`);
		await db.run(sql`INSERT INTO library_books (id,profile_id,client_key,source,catalog_id,title,author,added_at,created_at,updated_at) VALUES ('b1','g1','catalog:x','catalog','x','Book','',1,1,1)`);
	});
	await v2.database.close();
	const v3 = await openDb(data, store);
	assert.deepEqual(v3.result.applied, ["0003_shared_device"]);
	await v3.database.close();
	const { ctx } = await openCtx(data, { store });
	const guest = await data.ensureActiveProfile(ctx);
	assert.equal(guest.id, "g1", "the same guest is reopened, not replaced");
	assert.equal((await data.listNotes(ctx, "g1")).length, 1);
	assert.equal((await data.listLibraryBooks(ctx, "g1")).length, 1);
	assert.equal((await data.getDeviceVisibility(ctx, "g1")).visible, false, "existing profiles default to hidden");
	assert.deepEqual((await data.migrate(ctx.database)).applied, [], "rerunning setup is safe");
});

test("first launch offline: guest opens with no auth or network", async () => {
	const { ctx } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	assert.equal(guest.kind, "guest");
	assert.equal(guest.remoteAccountId, null);
	assert.deepEqual(await data.listDeviceDirectory(ctx, guest.id), []);
	assert.deepEqual(await data.listConversations(ctx, guest.id), []);
});

test("11 local profiles offline: distinct stable ids, hidden by default, scoped books/settings/notes", async () => {
	const store = createWebStore();
	const a = await openCtx(data, { store });
	const guest = await data.ensureActiveProfile(a.ctx);
	const ids = [];
	for (let i = 0; i < 11; i++) {
		const p = await data.createLocalProfile(a.ctx, { displayName: `Reader ${i}` });
		assert.equal(p.kind, "local");
		assert.equal((await data.getDeviceVisibility(a.ctx, p.id)).visible, false, "new profiles start hidden");
		await data.createNote(a.ctx, p.id, { title: `note ${i}` });
		if (i % 2 === 0) await data.addCatalogBook(a.ctx, p.id, SENECA);
		await a.ctx.database.write((db) => data.settingsRepository.set(db, p.id, "reader.size", i, 1));
		ids.push(p.id);
	}
	assert.equal(new Set(ids).size, 11);
	assert.equal(await data.getActiveProfileId(a.ctx), guest.id, "creating a profile never switches to it");

	const b = await openCtx(data, { store }); // restart
	const listed = (await data.listProfiles(b.ctx)).map((p) => p.id);
	for (const id of ids) assert.ok(listed.includes(id), "ids survive restart unchanged");
	for (const [i, id] of ids.entries()) {
		assert.deepEqual((await data.listNotes(b.ctx, id)).map((n) => n.title), [`note ${i}`]);
		assert.equal((await data.listLibraryBooks(b.ctx, id)).length, i % 2 === 0 ? 1 : 0);
		assert.equal(await b.ctx.database.read((db) => data.settingsRepository.get(db, id, "reader.size")), i);
	}
	assert.deepEqual(await data.listNotes(b.ctx, guest.id), []);
	assert.deepEqual(await data.listDeviceDirectory(b.ctx, guest.id), [], "nobody opted in, nobody listed");
});

test("local profiles are never targets of legacy import or guest promotion", async () => {
	const { ctx, people } = await device(data, 1, { visible: false });
	const source = { list: async () => [], importedIds: async () => new Set(), markImported: async () => {} };
	assert.equal((await data.importLegacyScans(ctx, people[0].id, source)).status, "skipped_not_guest");
	await assert.rejects(data.promoteGuest(ctx, people[0].id, { kind: "new", displayName: "X" }), { name: "ValidationError" });
});
