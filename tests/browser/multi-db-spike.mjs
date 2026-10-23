// DISPOSABLE SPIKE (real Chrome, persistent profile): can one install hold several SQLite files,
// one per saved person plus a shared device database, on the web (jeep-sqlite → IndexedDB)?
// Usage: npm run build:test && node tests/browser/multi-db-spike.mjs
import assert from "node:assert/strict";
import { BASE, crash, freshProfile, launch, serveDist } from "./harness.mjs";

const server = await serveDist(4335);
const dir = await freshProfile("/tmp/boooks-multi-db-spike");
const results = [];
const record = (id, question, answer) => {
	results.push({ id, question, answer });
	console.log(`${id} ${question}\n   → ${answer}`);
};
const spike = (page, fn, ...args) =>
	page.evaluate(([f, a]) => window.__boooksMultiDbSpike[f](...a), [fn, args]);
const ready = (page) => page.waitForFunction(() => window.__boooksMultiDbSpike, null, { timeout: 60_000 });
const open = async (page) => {
	await page.goto(`${server.origin}${BASE}more`);
	await ready(page);
};
const idbSize = (page) =>
	page.evaluate(async () => {
		const est = await navigator.storage?.estimate?.();
		return est?.usage ?? -1;
	});

try {
	let { ctx, page } = await launch(dir);
	await open(page);

	// M1: the pre-spike pattern (fresh SQLiteConnection per database) vs one shared connection.
	await spike(page, "open", ["device", "person-a"]);
	const m1 = await spike(page, "freshConnectionClosesOthers", "person-a", "person-b");
	record("M1", "Fresh SQLiteConnection per db (old pattern): does opening a 2nd db close the 1st?", m1);
	// The control leaves the plugin and the shared connection out of step; start clean.
	await page.reload();
	await ready(page);

	// M2: several files open at once through the shared connection, independent rows.
	const names = ["device", "person-a", "person-b", "person-c"];
	await spike(page, "open", names);
	for (const n of names) await spike(page, "write", n, `${n}:1`);
	await spike(page, "write", "person-a", "person-a:2");
	const s2 = await spike(page, "stats");
	assert.deepEqual(s2, { device: 1, "person-a": 2, "person-b": 1, "person-c": 1 });
	record("M2", "4 files open at once via one shared connection: rows stay per file?", JSON.stringify(s2));

	// M3: interleaved writes across files (two people + device in quick succession).
	await Promise.all([
		spike(page, "write", "person-b", "b-x"),
		spike(page, "write", "device", "dev-x"),
		spike(page, "write", "person-c", "c-x"),
	]);
	const s3 = await spike(page, "stats");
	assert.deepEqual(s3, { device: 2, "person-a": 2, "person-b": 2, "person-c": 2 });
	record("M3", "Concurrent writes to different files (each file serialized): all committed?", JSON.stringify(s3));

	// M4: clean restart: every file reloads from IndexedDB with its own rows.
	await ctx.close();
	({ ctx, page } = await launch(dir));
	await open(page);
	await spike(page, "open", names);
	const s4 = await spike(page, "stats");
	assert.deepEqual(s4, s3);
	record("M4", "Clean restart: each file restored from IndexedDB?", JSON.stringify(s4));

	// M5: SIGKILL right after a flushed write to one file while others stay open.
	await spike(page, "write", "person-b", "b-before-crash");
	await crash(ctx, dir);
	({ ctx, page } = await launch(dir));
	await open(page);
	await spike(page, "open", names);
	const s5 = await spike(page, "stats");
	assert.equal(s5["person-b"], 3);
	assert.equal(s5["person-a"], 2);
	record("M5", "SIGKILL after a flushed write: that row survives, other files intact?", JSON.stringify(s5));

	// M6: close one person's file while others remain usable (the "switch person" path).
	await spike(page, "close", "person-a");
	await spike(page, "write", "person-b", "b-after-close-a");
	const s6 = await spike(page, "stats");
	assert.equal(s6["person-a"], undefined);
	assert.equal(s6["person-b"], 4);
	await spike(page, "open", ["person-a"]);
	assert.deepEqual(await spike(page, "read", "person-a"), ["person-a:1", "person-a:2"]);
	record("M6", "Close one file, keep others; reopen it: data intact?", "yes");

	// M7: storage growth per extra empty person file (web).
	const before = await idbSize(page);
	for (let i = 0; i < 10; i++) await spike(page, "open", [`person-extra-${i}`]);
	const after = await idbSize(page);
	record("M7", "Storage used by 10 extra (tiny) person files on web", `${Math.round((after - before) / 1024)} KiB (navigator.storage.estimate; coarse)`);

	// M8: offline: open + write + reload, no network.
	await ctx.setOffline(true);
	await spike(page, "write", "person-c", "c-offline");
	await page.reload();
	await ready(page);
	await spike(page, "open", ["person-c"]);
	const c = await spike(page, "read", "person-c");
	await ctx.setOffline(false);
	assert.ok(c.includes("c-offline"));
	record("M8", "Offline write + reload on one person's file?", "kept");

	await ctx.close();
	console.log(`\nmulti-db-spike (web): ${results.length} questions answered`);
} catch (error) {
	console.error("✖ multi-db-spike failed:", error);
	process.exitCode = 1;
} finally {
	server.close();
}
