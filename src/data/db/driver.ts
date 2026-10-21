/** Raw SQL access. Implementations: Capacitor SQLite (app) and sql.js (tests). */
export type SqlValue = string | number | null | Uint8Array;
export type SqlRow = Record<string, SqlValue>;

export interface SqlDriver {
	/** Human-readable engine name for logs and the debug panel. */
	readonly name: string;
	/** Multiple statements, no bind values (DDL, BEGIN/COMMIT). */
	exec(sql: string): Promise<void>;
	/** One statement with bind values; returns affected row count. */
	run(sql: string, params: SqlValue[]): Promise<{ changes: number }>;
	/** One SELECT; rows keep the column order of the statement. */
	query(sql: string, params: SqlValue[]): Promise<SqlRow[]>;
	/**
	 * Make committed data durable. Web (jeep-sqlite): copies the in-memory DB to IndexedDB.
	 * Native: no-op (SQLite writes to disk on COMMIT). Never called inside a transaction.
	 */
	flush(): Promise<void>;
	close(): Promise<void>;
}
