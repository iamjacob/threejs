import { Capacitor } from "@capacitor/core";
import {
	CapacitorSQLite,
	SQLiteConnection,
	type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import type { SqlDriver, SqlRow, SqlValue } from "./driver";

/**
 * @capacitor-community/sqlite driver for both targets.
 * - Native (iOS/Android): real SQLite file; COMMIT is durable, flush() is a no-op.
 * - Web: <jeep-sqlite> runs sql.js in memory; flush() = saveToStore() into IndexedDB (spike S4–S6).
 * Plugin-level transactions are disabled (`transaction=false`); Database owns BEGIN/COMMIT.
 */
export async function openCapacitorDriver(
	databaseName: string,
): Promise<SqlDriver> {
	const platform = Capacitor.getPlatform();
	const sqlite = new SQLiteConnection(CapacitorSQLite);
	if (platform === "web") {
		const { defineCustomElements } = await import("jeep-sqlite/loader");
		defineCustomElements(window);
		if (!document.querySelector("jeep-sqlite")) {
			const element = document.createElement("jeep-sqlite");
			// Vite base path, so the wasm resolves under /threejs/ and in Capacitor's WebView.
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

	await sqlite.checkConnectionsConsistency().catch(() => {});
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
	const [row] = await driver.query("SELECT 1 AS zeta, 2 AS alpha, 3 AS mid", []);
	const values = row ? Object.values(row) : [];
	if (values.join(",") !== "1,2,3") {
		throw new Error(
			`${driver.name} does not preserve column order (${JSON.stringify(row)})`,
		);
	}
}

export type { SqlValue };
