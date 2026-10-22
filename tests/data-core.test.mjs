import assert from "node:assert/strict";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { createWebStore, loadData, openDb, SQL } from "./data-helpers.mjs";

const data = await loadData();
const { profiles, notes } = data.schema;
const now = 1_700_000_000_000;
const guest = { id: "g1", kind: "guest", displayName: "Guest", createdAt: now, updatedAt: now };
const note = (id, extra = {}) => ({ id, profileId: "g1", clientKey: id, title: id, createdAt: now, updatedAt: now, ...extra });

test("empty database: all migrations apply and are recorded", async () => {
	const { database, result } = await openDb(data);
	assert.deepEqual(result.applied, ["0000_init", "0001_note_pinned", "0002_library_books"]);
	const tables = await database.queryRaw(
		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
	);
	assert.deepEqual(tables.map((t) => t.name), [
		"_migrations", "app_state", "files", "library_books", "notes", "outbox", "profile_merges", "profile_settings", "profiles",
	]);
	assert.deepEqual((await data.migrate(database)).applied, [], "re-running migrate is a no-op");
});

test("prior schema (0000 only, with data) upgrades to 0001 without losing rows", async () => {
	const store = createWebStore();
	const first = await openDb(data, store, data.migrations.slice(0, 1));
	assert.deepEqual(first.result.applied, ["0000_init"]);
	await first.database.write(async (db) => {
		await db.insert(profiles).values(guest);
		await db.run(sql`INSERT INTO notes (id, profile_id, client_key, title, body, created_at, updated_at)
			VALUES ('n1', 'g1', 'k1', 'Old note', '', ${now}, ${now})`);
	});
	await first.database.close();

	const second = await openDb(data, store);
	assert.deepEqual(second.result.applied, ["0001_note_pinned", "0002_library_books"]);
	const rows = await second.database.read((db) => db.select().from(notes));
	assert.equal(rows.length, 1);
	assert.equal(rows[0].title, "Old note");
	assert.equal(rows[0].pinned, false, "new column gets its default");
});

test("a database from a newer app version is refused, not guessed at", async () => {
	const { database } = await openDb(data);
	await database.write((db) => db.run(sql`INSERT INTO _migrations VALUES ('9999_future', 1)`));
	await assert.rejects(data.migrate(database), /newer app version/);
});

test("a failing migration rolls back and leaves the previous version", async () => {
	const broken = [...data.migrations, { id: "0003_broken", statements: ["ALTER TABLE notes ADD x integer", "SELECT * FROM missing_table"] }];
	const { database } = await openDb(data);
	await assert.rejects(data.migrate(database, broken));
	const cols = await database.queryRaw("SELECT name FROM pragma_table_info('notes')");
	assert.ok(!cols.some((c) => c.name === "x"), "partial migration was rolled back");
	const ids = await database.queryRaw("SELECT id FROM _migrations ORDER BY id");
	assert.deepEqual(ids.map((r) => r.id), ["0000_init", "0001_note_pinned", "0002_library_books"]);
});


test("write() commits atomically and rolls back on error", async () => {
	const { database } = await openDb(data);
	await database.write((db) => db.insert(profiles).values(guest));
	await assert.rejects(
		database.write(async (db) => {
			await db.insert(notes).values(note("a"));
			await db.insert(notes).values(note("a", { clientKey: "b" }));
		}),
	);
	const rows = await database.read((db) => db.select().from(notes));
	assert.equal(rows.length, 0, "first insert of the failed write was rolled back");
});

test("drizzle maps columns by position correctly (column order preserved)", async () => {
	const { database } = await openDb(data);
	await database.write((db) => db.insert(profiles).values({ ...guest, displayName: "Zed" }));
	const [row] = await database.read((db) => db.select().from(profiles).where(eq(profiles.id, "g1")));
	assert.deepEqual(row, { ...guest, displayName: "Zed", remoteAccountId: null, mergedInto: null });
});

test("foreign keys are enforced, including after a flush", async () => {
	const { database } = await openDb(data);
	await database.flushNow();
	await assert.rejects(
		database.write((db) => db.insert(notes).values(note("x", { profileId: "missing" }))),
		// Drizzle wraps driver errors; the SQLite message is on `cause`.
		(e) => /FOREIGN KEY/.test(String(e.cause?.message ?? e.message)),
	);
});

test("web durability: data survives restart only after flush; write() flushes for you", async () => {
	const store = createWebStore();
	const a = await openDb(data, store);
	await a.database.write((db) => db.insert(profiles).values(guest));
	// An unflushed change (bypassing write()), then a "crash" with no close/flush.
	await a.driver.run("INSERT INTO app_state (key, value) VALUES ('lost', '1')", []);
	const b = await openDb(data, store);
	assert.equal((await b.database.read((db) => db.select().from(profiles))).length, 1, "flushed write survived");
	const lost = await b.database.queryRaw("SELECT * FROM app_state WHERE key='lost'");
	assert.equal(lost.length, 0, "unflushed change did not survive (matches spike S6)");
});

test("nested write is rejected; a closed database rejects work", async () => {
	const { database } = await openDb(data);
	await assert.rejects(
		database.write(async () => database.write(async () => {})),
		(e) => e.code === "nested_write",
	);
	await database.close();
	await assert.rejects(database.read(async () => 1), (e) => e.code === "closed");
});

test("the driver refuses to flush inside an open transaction (spike S7 guard)", async () => {
	const { driver } = await openDb(data);
	await driver.exec("BEGIN");
	await assert.rejects(driver.flush(), /inside an open transaction/);
	await driver.exec("ROLLBACK");
	await driver.flush();
});

test("flush failure surfaces as DatabaseError(flush_failed)", async () => {
	const driver = data.createSqlJsDriver(SQL, { persist: () => { throw new Error("QuotaExceededError"); } });
	await assert.rejects(data.migrate(new data.Database(driver)), (e) => e.code === "flush_failed");
});

test("concurrent writes are serialized (no interleaving inside a transaction)", async () => {
	const { database } = await openDb(data);
	await database.write((db) => db.insert(profiles).values(guest));
	const order = [];
	await Promise.all(
		[1, 2, 3].map((i) =>
			database.write(async (db) => {
				order.push(`start${i}`);
				await new Promise((r) => setTimeout(r, 5));
				await db.insert(notes).values(note(`n${i}`));
				order.push(`end${i}`);
			}),
		),
	);
	assert.deepEqual(order, ["start1", "end1", "start2", "end2", "start3", "end3"]);
});
