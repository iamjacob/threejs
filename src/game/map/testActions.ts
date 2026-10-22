import { sql } from "drizzle-orm";
import { getShelfBooks } from "../../components/shelves/shelfBooks";
import { bootstrapData } from "../../data/bootstrap";
import { importLegacyScans } from "../../data/usecases/legacyScanImport";
import { addCatalogBook } from "../../data/usecases/libraryBooks";
import {
	ensureActiveProfile,
	getActiveProfileId,
	switchProfile,
} from "../../data/usecases/profiles";
import { promoteGuest } from "../../data/usecases/promoteGuest";
import { bookCatalog } from "../../lib/bookCatalog";
import { testHooksEnabled } from "./testProbe";

/**
 * Test-only actions for tests/browser/*.mjs (VITE_BOOOKS_TEST_HOOKS=1 builds only). Each calls the
 * REAL use cases; nothing here bypasses the repository/profile boundaries.
 */
declare global {
	interface Window {
		__boooksTest?: {
			activeProfileId(): Promise<string | undefined>;
			addCatalogBooks(count: number): Promise<number>;
			promoteToNewAccount(name: string): Promise<string>;
			/**
			 * Imports `count` synthetic scans for the active guest through the REAL legacy import path
			 * (FileStore + SQLite + verification), for size/performance checks. Returns imported count.
			 */
			importSyntheticScans(count: number, dataUrl: string): Promise<number>;
			/** Signs out to a brand-new empty guest (same as a fresh device user); returns its id. */
			newGuest(): Promise<string>;
			switchProfile(id: string): Promise<void>;
		};
	}
}

export function installTestActions() {
	if (!testHooksEnabled || typeof window === "undefined") return;
	const ctx = async () => {
		const boot = await bootstrapData();
		if (boot.status !== "ready")
			throw new Error(`data not ready: ${boot.status}`);
		return boot.ctx;
	};
	window.__boooksTest = {
		async activeProfileId() {
			return getActiveProfileId(await ctx());
		},
		async addCatalogBooks(count) {
			const c = await ctx();
			const pid = await getActiveProfileId(c);
			if (!pid) throw new Error("no active profile");
			const books = getShelfBooks(bookCatalog).slice(0, count);
			for (const b of books)
				await addCatalogBook(c, pid, {
					id: b.id,
					title: b.title,
					author: b.author,
					size: {
						width: b.dimensions[0] * 30,
						height: b.dimensions[1] * 30,
						thickness: b.dimensions[2] * 30,
					},
				});
			return books.length;
		},
		async promoteToNewAccount(name) {
			const c = await ctx();
			const pid = await getActiveProfileId(c);
			if (!pid) throw new Error("no active profile");
			return (await promoteGuest(c, pid, { kind: "new", displayName: name }))
				.targetProfileId;
		},
		async importSyntheticScans(count, dataUrl) {
			const c = await ctx();
			const pid = await getActiveProfileId(c);
			if (!pid) throw new Error("no active profile");
			const records = Array.from({ length: count }, (_, i) => ({
				id: `synthetic-${i}`,
				title: `Synthetic ${i}`,
				author: "Test",
				cover: { front: dataUrl },
				dimensions: [0.4, 0.6, 0.05] as [number, number, number],
			}));
			const marks = new Set<string>();
			const report = await importLegacyScans(c, pid, {
				list: async () => records,
				importedIds: async () => marks,
				markImported: async (id) => {
					marks.add(id);
				},
			});
			return report.imported.length;
		},
		async newGuest() {
			const c = await ctx();
			// Simulates "sign out": no active profile → ensureActiveProfile creates a new guest.
			await c.database.write((db) =>
				db.run(sql`DELETE FROM app_state WHERE key = 'active_profile_id'`),
			);
			return (await ensureActiveProfile(c)).id;
		},
		async switchProfile(id) {
			await switchProfile(await ctx(), id);
		},
	};
}
