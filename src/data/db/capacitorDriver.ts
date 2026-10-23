import { Capacitor } from "@capacitor/core";
import {
	CapacitorSQLite,
	SQLiteConnection,
	type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import type { SqlDriver, SqlRow, SqlValue } from "./driver";

/**
 * ONE SQLiteConnection per page, shared by every database file. A fresh SQLiteConnection knows no
 * open connections, and its checkConnectionsConsistency() makes the native plugin (and jeep-sqlite
 * on web) close ALL open connections, so a second database opened that way would close the first
 * (source: CapacitorSQLite.java / jeep-sqlite _checkConnectionsConsistency; verified by the
 * multi-db spike, check M1). Consistency is checked once, when the shared connection is created.
 */
let shared: Promise<SQLiteConnection> | undefined;

function sharedConnection(platform: string) {
	shared ??= (async () => {
		const sqlite = new SQLiteConnection(CapacitorSQLite);
		if (platform === "web") {
			const { defineCustomElements } = await import("jeep-sqlite/loader");
			defineCustomElements(window);
			if (!document.querySelector("jeep-sqlite")) {
				const element = document.createElement("jeep-sqlite");
				// Vite base path, so the wasm resolves under /beta/ and in Capacitor's WebView.
				element.setAttribute(
					"wasmpath",
					`${import.meta.env.BASE_URL}assets`.replace(/\/$/, ""),
				);
				element.style.display = "none";
				document.body.append(element);
			}
			await customElements.whenDefined("jeep-sqlite");
			await sqlite.initWebStore();
		}
		// After a WebView reload the native side may still hold connections this page never made.
		await sqlite.checkConnectionsConsistency().catch(() => {});
		return sqlite;
	})();
	return shared;
}

/**
 * @capacitor-community/sqlite driver for both targets.
 * - Native (iOS/Android): real SQLite file; COMMIT is durable, flush() is a no-op.
 * - Web: <jeep-sqlite> runs sql.js in memory; flush() = saveToStore() into IndexedDB (spike S4–S6).
 * Plugin-level transactions are disabled (`transaction=false`); Database owns BEGIN/COMMIT.
 * Several database files can be open at once; they share one plugin connection object.
 */
export async function openCapacitorDriver(
	databaseName: string,
): Promise<SqlDriver> {
	const platform = Capacitor.getPlatform();
	const sqlite = await sharedConnection(platform);
	const existing = (await sqlite.isConnection(databaseName, false)).result;
	const connection: SQLiteDBConnection = existing
		? await sqlite.retrieveConnection(databaseName, false)
		: await sqlite.createConnection(
				databaseName,
				false,
				"no-encryption",
				1,
				false,
			);
	await connection.open();
	await connection.execute("PRAGMA foreign_keys = ON;", false);

	const driver: SqlDriver = {
		name: `capacitor-sqlite:${platform}`,
		async exec(sql) {
			await connection.execute(sql, false);
		},
		async run(sql, params) {
			const result = await connection.run(sql, params, false);
			return { changes: result.changes?.changes ?? 0 };
		},
		async query(sql, params) {
			const result = await connection.query(sql, params);
			return (result.values ?? []) as SqlRow[];
		},
		async flush() {
			if (platform === "web") await sqlite.saveToStore(databaseName);
		},
		async close() {
			await sqlite.closeConnection(databaseName, false);
		},
	};
	await assertColumnOrder(driver);
	return driver;
}

/**
 * Drizzle's proxy maps result rows by position, but this plugin returns objects. Fail loudly at
 * startup if a platform does not preserve SELECT column order, instead of silently swapping fields.
 */
export async function assertColumnOrder(driver: SqlDriver) {
	const [row] = await driver.query(
		"SELECT 1 AS zeta, 2 AS alpha, 3 AS mid",
		[],
	);
	const values = row ? Object.values(row) : [];
	if (values.join(",") !== "1,2,3") {
		throw new Error(
			`${driver.name} does not preserve column order (${JSON.stringify(row)})`,
		);
	}
}

export type { SqlValue };
