import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "../schema";
import type { SqlDriver, SqlValue } from "./driver";

export type Db = SqliteRemoteDatabase<typeof schema>;

export class DatabaseError extends Error {
	constructor(
		message: string,
		readonly code: "closed" | "flush_failed" | "nested_write" | "query_failed",
		options?: { cause?: unknown },
	) {
		super(message, options);
		this.name = "DatabaseError";
	}
}

/**
 * The only way to reach SQLite.
 *
 * - Every operation runs on one serialized queue. Drizzle's sqlite-proxy sends BEGIN/COMMIT through
 *   the same callback, so nothing may interleave with a transaction.
 * - `write()` always runs BEGIN IMMEDIATE … COMMIT and then `driver.flush()`. On web, saving while a
 *   transaction is open silently ends it (spike S7), so the flush only ever happens here.
 * - `write()` resolves only after the flush; on web that means the data is in IndexedDB.
 */
export class Database {
	readonly db: Db;
	private queue: Promise<unknown> = Promise.resolve();
	private inWrite = false;
	private closed = false;

	constructor(private readonly driver: SqlDriver) {
		this.db = drizzle(
			async (sql, params, method) => {
				const values = params as SqlValue[];
				if (method === "run") {
					await this.driver.run(sql, values);
					return { rows: [] };
				}
				const rows = (await this.driver.query(sql, values)).map((row) =>
					Object.values(row),
				);
				return { rows: method === "get" ? (rows[0] ?? []) : rows };
			},
			{ schema },
		);
	}

	get engine() {
		return this.driver.name;
	}

	/** Read-only work. Serialized with writes so it never observes a half-done transaction. */
	read<T>(fn: (db: Db) => Promise<T>): Promise<T> {
		return this.enqueue(() => fn(this.db));
	}

	/** Atomic, durable write. Rolls back and rethrows on any error. */
	write<T>(fn: (db: Db) => Promise<T>): Promise<T> {
		if (this.inWrite) {
			// Re-entering would deadlock the queue; compose use cases inside one write instead.
			return Promise.reject(
				new DatabaseError("write() called inside write()", "nested_write"),
			);
		}
		return this.enqueue(async () => {
			this.inWrite = true;
			try {
				await this.driver.exec("BEGIN IMMEDIATE");
				let result: T;
				try {
					result = await fn(this.db);
				} catch (error) {
					await this.driver.exec("ROLLBACK").catch(() => {});
					throw error;
				}
				await this.driver.exec("COMMIT");
				return result;
			} finally {
				this.inWrite = false;
			}
		}).then(async (result) => {
			await this.flushNow();
			return result;
		});
	}

	/** Raw multi-statement SQL inside the queue (migrations). Caller manages transactions. */
	execRaw(sql: string) {
		return this.enqueue(() => this.driver.exec(sql));
	}

	queryRaw(sql: string, params: SqlValue[] = []) {
		return this.enqueue(() => this.driver.query(sql, params));
	}

	/** Flush on demand (e.g. app pause). Waits for queued writes first. */
	flushNow() {
		return this.enqueue(async () => {
			try {
				await this.driver.flush();
			} catch (cause) {
				throw new DatabaseError(
					"Saved in memory, but could not persist to device storage",
					"flush_failed",
					{ cause },
				);
			}
		});
	}

	async close() {
		await this.enqueue(async () => {
			await this.driver.flush();
			await this.driver.close();
			this.closed = true;
		});
	}

	private enqueue<T>(task: () => Promise<T>): Promise<T> {
		if (this.closed) {
			return Promise.reject(new DatabaseError("Database is closed", "closed"));
		}
		const next = this.queue.then(task, task);
		this.queue = next.catch(() => {});
		return next;
	}
}
