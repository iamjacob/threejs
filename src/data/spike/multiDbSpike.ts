import { openCapacitorDriver } from "../db/capacitorDriver";
import type { SqlDriver } from "../db/driver";

/**
 * DISPOSABLE SPIKE (test-hooks builds only): can one install hold several SQLite files at once,
 * on web (jeep-sqlite → IndexedDB) and native (real files), safely enough to give each saved
 * person their own database plus one shared device database?
 *
 * Exposed as window.__boooksMultiDbSpike for tests/browser/multi-db-spike*.mjs. Not wired into
 * the app. Questions it answers are listed in docs/engineering/boooks-multi-db-plan.md.
 */
declare global {
	interface Window {
		__boooksMultiDbSpike?: {
			open(names: string[]): Promise<string[]>;
			write(name: string, value: string): Promise<void>;
			read(name: string): Promise<string[]>;
			close(name: string): Promise<void>;
			stats(): Promise<Record<string, number>>;
			/**
			 * M1 control: opens `second` through a FRESH SQLiteConnection (the pre-spike pattern) while
			 * `first` is open via the shared one, then reports whether `first` still answers.
			 */
			freshConnectionClosesOthers(
				first: string,
				second: string,
			): Promise<string>;
		};
	}
}

export function installMultiDbSpike() {
	if (
		import.meta.env.VITE_BOOOKS_TEST_HOOKS !== "1" ||
		typeof window === "undefined"
	)
		return;
	const open = new Map<string, SqlDriver>();
	const get = (name: string) => {
		const d = open.get(name);
		if (!d) throw new Error(`${name} is not open`);
		return d;
	};
	window.__boooksMultiDbSpike = {
		async open(names) {
			for (const name of names) {
				if (open.has(name)) continue;
				const driver = await openCapacitorDriver(name);
				await driver.exec(
					"CREATE TABLE IF NOT EXISTS spike (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT NOT NULL)",
				);
				await driver.flush();
				open.set(name, driver);
			}
			return [...open.keys()];
		},
		async write(name, value) {
			const d = get(name);
			await d.exec("BEGIN IMMEDIATE");
			await d.run("INSERT INTO spike (v) VALUES (?)", [value]);
			await d.exec("COMMIT");
			await d.flush();
		},
		async read(name) {
			const rows = await get(name).query("SELECT v FROM spike ORDER BY id", []);
			return rows.map((r) => String(r.v));
		},
		async close(name) {
			await get(name).close();
			open.delete(name);
		},
		async freshConnectionClosesOthers(first, second) {
			const { CapacitorSQLite, SQLiteConnection } = await import(
				"@capacitor-community/sqlite"
			);
			const fresh = new SQLiteConnection(CapacitorSQLite);
			await fresh.checkConnectionsConsistency().catch(() => {});
			const conn = await fresh.createConnection(
				second,
				false,
				"no-encryption",
				1,
				false,
			);
			await conn.open();
			try {
				await get(first).query("SELECT count(*) AS c FROM spike", []);
				return "first still open";
			} catch (error) {
				open.delete(first);
				return `first closed: ${error instanceof Error ? error.message : String(error)}`;
			} finally {
				await fresh.closeConnection(second, false).catch(() => {});
			}
		},
		async stats() {
			const out: Record<string, number> = {};
			for (const [name, d] of open) {
				const [row] = await d.query("SELECT count(*) AS c FROM spike", []);
				out[name] = Number(row?.c ?? 0);
			}
			return out;
		},
	};
}
