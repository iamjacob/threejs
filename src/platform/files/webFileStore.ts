import { assertBlobKey, type FileStore } from "./fileStore";

const DB_NAME = "boooks-files";
const STORE = "blobs";

/**
 * Web blobs in a dedicated IndexedDB store (not jeep's in-memory SQLite, so large images never
 * inflate the database snapshot that saveToStore() rewrites on every commit).
 * Durability depends on the browser: call `navigator.storage.persist()` (see requestPersistence).
 */
export function createWebFileStore(factory: IDBFactory = indexedDB): FileStore {
	let opening: Promise<IDBDatabase> | undefined;
	const open = () => {
		opening ??= new Promise<IDBDatabase>((resolve, reject) => {
			const request = factory.open(DB_NAME, 1);
			request.onupgradeneeded = () => request.result.createObjectStore(STORE);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => {
				opening = undefined;
				reject(request.error);
			};
		});
		return opening;
	};
	const run = async <T>(
		mode: IDBTransactionMode,
		fn: (store: IDBObjectStore) => IDBRequest<T>,
	) => {
		const db = await open();
		return new Promise<T>((resolve, reject) => {
			const tx = db.transaction(STORE, mode);
			const request = fn(tx.objectStore(STORE));
			// Resolve on commit, not on request success, so "written" means durable.
			tx.oncomplete = () => resolve(request.result);
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error ?? new Error("IndexedDB aborted"));
		});
	};
	return {
		name: "indexeddb",
		async put(key, bytes) {
			assertBlobKey(key);
			// Store a plain ArrayBuffer copy; Safari has had issues persisting typed-array views.
			await run("readwrite", (s) => s.put(bytes.slice().buffer, key));
		},
		async get(key) {
			const value = await run<ArrayBuffer | undefined>("readonly", (s) =>
				s.get(key),
			);
			return value ? new Uint8Array(value) : undefined;
		},
		async has(key) {
			return (await run<number>("readonly", (s) => s.count(key))) > 0;
		},
		async delete(key) {
			await run("readwrite", (s) => s.delete(key));
		},
	};
}

/** Asks the browser not to evict site data under storage pressure. Returns the granted state. */
export async function requestPersistence(): Promise<boolean | "unsupported"> {
	if (!navigator.storage?.persist) return "unsupported";
	if (await navigator.storage.persisted()) return true;
	return navigator.storage.persist();
}
