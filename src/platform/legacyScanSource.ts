import type {
	LegacyScanRecord,
	LegacyScanSource,
} from "../data/usecases/legacyScanRecord";

/**
 * Browser/WebView adapter over the scanner's legacy IndexedDB `boooks-scans` (read-only) plus a
 * SEPARATE marker database `boooks-scans-import`. The scanner opens `boooks-scans` at version 1;
 * bumping that version here would make its `open(name, 1)` fail with VersionError, so markers
 * live elsewhere. Records in `boooks-scans` are never modified or deleted by the import.
 */
const LEGACY_DB = "boooks-scans";
const MARKER_DB = "boooks-scans-import";

function open(
	name: string,
	upgrade?: (db: IDBDatabase) => void,
): Promise<IDBDatabase | undefined> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(name);
		request.onupgradeneeded = () => {
			// Never create the legacy database: if it doesn't exist, there is nothing to import.
			if (!upgrade) {
				request.transaction?.abort();
				return;
			}
			upgrade(request.result);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			request.error?.name === "AbortError"
				? resolve(undefined)
				: reject(request.error);
	});
}

function all<T>(db: IDBDatabase, store: string): Promise<T[]> {
	return new Promise((resolve, reject) => {
		if (!db.objectStoreNames.contains(store)) return resolve([]);
		const req = db.transaction(store).objectStore(store).getAll();
		req.onsuccess = () => resolve(req.result as T[]);
		req.onerror = () => reject(req.error);
	});
}

export function createLegacyScanSource(): LegacyScanSource | undefined {
	if (typeof indexedDB === "undefined") return undefined;
	const markers = () =>
		open(MARKER_DB, (db) => {
			if (!db.objectStoreNames.contains("imported"))
				db.createObjectStore("imported", { keyPath: "id" });
		});
	return {
		async list() {
			const db = await open(LEGACY_DB);
			if (!db) return [];
			try {
				return await all<LegacyScanRecord>(db, "books");
			} finally {
				db.close();
			}
		},
		async importedIds() {
			const db = await markers();
			if (!db) return new Set();
			try {
				const rows = await all<{ id: string }>(db, "imported");
				return new Set(rows.map((r) => r.id));
			} finally {
				db.close();
			}
		},
		async markImported(id, profileId) {
			const db = await markers();
			if (!db) throw new Error("marker store unavailable");
			try {
				await new Promise<void>((resolve, reject) => {
					const tx = db.transaction("imported", "readwrite");
					tx.objectStore("imported").put({ id, profileId, at: Date.now() });
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
					tx.onabort = () => reject(tx.error);
				});
			} finally {
				db.close();
			}
		},
	};
}
