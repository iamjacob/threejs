import { sql } from "drizzle-orm";
import type { Database } from "./database";
import { migrations as bundled } from "./migrations.gen";

export type Migration = { id: string; statements: readonly string[] };

/**
 * Applies bundled migrations in order. Each migration runs in its own transaction together with
 * its `_migrations` record, so a failure leaves the database at the previous version.
 * Unknown applied ids (a newer app wrote this DB) stop startup instead of guessing.
 */
export async function migrate(
	database: Database,
	migrations: readonly Migration[] = bundled,
) {
	await database.execRaw(
		"CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)",
	);
	const appliedRows = await database.queryRaw(
		"SELECT id FROM _migrations ORDER BY id",
	);
	const applied = new Set(appliedRows.map((row) => String(row.id)));
	const known = new Set(migrations.map((m) => m.id));
	const unknown = [...applied].filter((id) => !known.has(id));
	if (unknown.length) {
		throw new Error(
			`Database was written by a newer app version (unknown migrations: ${unknown.join(", ")})`,
		);
	}
	const ran: string[] = [];
	for (const migration of migrations) {
		if (applied.has(migration.id)) continue;
		await database.write(async (db) => {
			for (const statement of migration.statements)
				await db.run(sql.raw(statement));
			await db.run(
				sql`INSERT INTO _migrations (id, applied_at) VALUES (${migration.id}, ${Date.now()})`,
			);
		});
		ran.push(migration.id);
	}
	return { applied: ran, total: migrations.length };
}
