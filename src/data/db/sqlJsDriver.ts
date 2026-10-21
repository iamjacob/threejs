import type { SqlDriver, SqlRow, SqlValue } from "./driver";

/** Minimal sql.js surface used here (the package ships no types). */
type SqlJsStatement = {
	step(): boolean;
	getAsObject(): Record<string, SqlValue>;
	free(): void;
};
type SqlJsDatabase = {
	exec(sql: string): unknown;
	run(sql: string, params?: SqlValue[]): void;
	prepare(sql: string, params?: SqlValue[]): SqlJsStatement;
	getRowsModified(): number;
	export(): Uint8Array;
	close(): void;
};
export type SqlJsStatic = {
	Database: new (bytes?: Uint8Array) => SqlJsDatabase;
};

/**
 * sql.js driver for Node tests. Optional `persist` simulates the web store: it receives the exported
 * bytes on flush, exactly like jeep-sqlite's saveToStore(). Writes after the last flush are lost.
 */
export function createSqlJsDriver(
	SQL: SqlJsStatic,
	options: {
		bytes?: Uint8Array | null;
		persist?: (bytes: Uint8Array) => Promise<void> | void;
	} = {},
): SqlDriver & { raw: SqlJsDatabase } {
	const db = options.bytes
		? new SQL.Database(options.bytes)
		: new SQL.Database();
	db.exec("PRAGMA foreign_keys = ON;");
	let transactionDepth = 0;
	return {
		name: "sql.js",
		raw: db,
		async exec(sql) {
			db.exec(sql);
			const keyword = sql.trim().split(/\s+/)[0]?.toUpperCase();
			if (keyword === "BEGIN") transactionDepth++;
			if (keyword === "COMMIT" || keyword === "ROLLBACK")
				transactionDepth = Math.max(0, transactionDepth - 1);
		},
		async run(sql, params) {
			db.run(sql, params);
			return { changes: db.getRowsModified() };
		},
		async query(sql, params) {
			const statement = db.prepare(sql, params);
			const rows: SqlRow[] = [];
			try {
				while (statement.step()) rows.push(statement.getAsObject());
			} finally {
				statement.free();
			}
			return rows;
		},
		async flush() {
			if (!options.persist) return;
			if (transactionDepth > 0) {
				// export() would silently end the transaction (spike S7).
				throw new Error("flush() inside an open transaction");
			}
			await options.persist(db.export());
			// Raw sql.js resets foreign_keys after export; jeep re-enables it (spike S8).
			db.exec("PRAGMA foreign_keys = ON;");
		},
		async close() {
			db.close();
		},
	};
}

