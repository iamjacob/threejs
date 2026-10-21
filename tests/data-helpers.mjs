// Shared helpers for data-layer tests: bundle a TS entry with rolldown (same approach as
// tests/scan-drafts.test.mjs) and open sql.js-backed Databases with a simulated web store.
import { rolldown } from "rolldown";
import initSqlJs from "sql.js";

const cache = new Map();
/** Bundles src/data/testing.ts so tests use the same code paths as the app. */
export async function loadData() {
	if (cache.has("data")) return cache.get("data");
	const build = await rolldown({
		input: "src/data/testing.ts",
		platform: "node",
		external: [/^drizzle-orm/],
		resolve: { tsconfigFilename: "tsconfig.json" },
	});
	const { output } = await build.generate({ format: "esm" });
	await build.close();
	const { mkdtempSync, writeFileSync } = await import("node:fs");
	const { join } = await import("node:path");
	// Write inside the repo so `drizzle-orm` resolves from node_modules.
	const dir = mkdtempSync(join(process.cwd(), "node_modules/.data-test-"));
	const file = join(dir, "data.mjs");
	writeFileSync(file, output[0].code);
	const mod = await import(file);
	cache.set("data", mod);
	return mod;
}

export const SQL = await initSqlJs();

/** In-memory "web store" that survives simulated restarts, like jeep's IndexedDB copy. */
export function createWebStore() {
	let bytes = null;
	let saves = 0;
	return {
		get bytes() {
			return bytes;
		},
		get saves() {
			return saves;
		},
		persist(next) {
			bytes = new Uint8Array(next);
			saves++;
		},
	};
}

/** Builds a DataContext with deterministic ids and a controllable clock. */
export async function openCtx(data, { store = createWebStore(), files = data.createMemoryFileStore(), start = 1_000 } = {}) {
	const { database, driver } = await openDb(data, store);
	let t = start;
	let n = 0;
	// Unique per context so a simulated restart never reuses ids; ordered within a context.
	const tag = Math.random().toString(36).slice(2, 7);
	const ctx = { database, files, clock: () => t, newId: () => `${tag}-${String(++n).padStart(4, "0")}` };
	return { ctx, store, files, driver, advance: (ms) => (t += ms) };
}

/** Opens (or re-opens after "restart") a migrated database over the store. */
export async function openDb(data, store = createWebStore(), migrations) {
	const driver = data.createSqlJsDriver(SQL, {
		bytes: store.bytes,
		persist: (b) => store.persist(b),
	});
	const database = new data.Database(driver);
	const result = await data.migrate(database, migrations);
	return { database, driver, store, result };
}
