// DISPOSABLE SPIKE on the Capacitor Android WebView (native SQLite files). Same questions as
// multi-db-spike.mjs, plus: are they really separate .db files on disk, and do they survive an
// OS kill (am force-stop)?
// Usage: VITE_BOOOKS_TEST_HOOKS=1 npm run cap:sync, build/install the APK, then run this.
import assert from "node:assert/strict";
import { _android as android } from "playwright-core";

const APP = "me.jacobg.boooks";
const [device] = await android.devices();
assert.ok(device, "an adb device/emulator is connected");
const shell = async (c) => (await device.shell(c)).toString().trim();
const results = [];
const record = (id, q, a) => {
	results.push({ id, q, a });
	console.log(`${id} ${q}\n   → ${a}`);
};
const spike = (page, fn, ...args) =>
	page.evaluate(([f, a]) => window.__boooksMultiDbSpike[f](...a), [fn, args]);

async function launch() {
	await shell(`am start -n ${APP}/.MainActivity`);
	const page = await (await device.webView({ pkg: APP }, { timeout: 60_000 })).page();
	await page.waitForFunction(() => window.__boooksMultiDbSpike, null, { timeout: 90_000 });
	return page;
}
const files = async () =>
	(await shell(`run-as ${APP} ls databases`)).split(/\s+/).filter((f) => f.endsWith("SQLite.db")).sort();

try {
	await shell(`pm clear ${APP}`);
	let page = await launch();
	const m1 = await spike(page, "open", ["device", "person-a"]).then(() =>
		spike(page, "freshConnectionClosesOthers", "person-a", "person-b"),
	);
	record("M1", "Fresh SQLiteConnection per db (old pattern): does opening a 2nd db close the 1st?", m1);
	await shell(`am force-stop ${APP}`);
	page = await launch();

	const names = ["device", "person-a", "person-b", "person-c"];
	await spike(page, "open", names);
	for (const n of names) await spike(page, "write", n, `${n}:1`);
	await Promise.all([spike(page, "write", "person-a", "a-2"), spike(page, "write", "device", "d-2")]);
	const s = await spike(page, "stats");
	assert.deepEqual(s, { device: 2, "person-a": 2, "person-b": 1, "person-c": 1 });
	record("M2/M3", "4 native files open via one shared connection; concurrent writes committed per file?", JSON.stringify(s));

	const onDisk = await files();
	for (const n of names) assert.ok(onDisk.includes(`${n}SQLite.db`), `${n}SQLite.db on disk`);
	record("N1", "Separate .db files on disk (app databases dir)?", onDisk.filter((f) => names.some((n) => f === `${n}SQLite.db`)).join(", "));

	await shell(`am force-stop ${APP}`);
	page = await launch();
	await spike(page, "open", names);
	assert.deepEqual(await spike(page, "stats"), s);
	record("M4/M5", "am force-stop (OS kill) then relaunch: every file intact?", "yes");

	await spike(page, "close", "person-a");
	await spike(page, "write", "person-b", "b-after-close-a");
	await spike(page, "open", ["person-a"]);
	assert.deepEqual(await spike(page, "read", "person-a"), ["person-a:1", "a-2"]);
	record("M6", "Close one file, keep others writable; reopen it intact?", "yes");

	const sizes = await shell(`run-as ${APP} ls -l databases`);
	const bytes = sizes.split("\n").filter((l) => /person-cSQLite\.db$/.test(l)).map((l) => l.trim().split(/\s+/)[4]);
	record("M7", "On-disk size of one small person file (native)", `${bytes[0]} bytes`);

	await shell("cmd connectivity airplane-mode enable");
	try {
		await spike(page, "write", "person-c", "c-offline");
		assert.ok((await spike(page, "read", "person-c")).includes("c-offline"));
		record("M8", "Airplane mode: write to one person's file?", "kept");
	} finally {
		await shell("cmd connectivity airplane-mode disable");
	}
	console.log(`\nmulti-db-spike (android): ${results.length} questions answered`);
} catch (error) {
	console.error("✖ android-multi-db-spike failed:", error);
	process.exitCode = 1;
} finally {
	await device.close();
}
