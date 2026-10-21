/**
 * Byte storage for images and other large binaries. SQLite stores only metadata and the key.
 * Keys are content addresses (sha256 hex), so blobs are immutable and safe to share between
 * profiles after a merge. Implementations differ per platform; do not assume identical behavior.
 */
export interface FileStore {
	readonly name: string;
	/** Idempotent: writing the same key twice keeps one copy. */
	put(key: string, bytes: Uint8Array): Promise<void>;
	/** Undefined if missing (e.g. user cleared site data but not SQLite). */
	get(key: string): Promise<Uint8Array | undefined>;
	has(key: string): Promise<boolean>;
	delete(key: string): Promise<void>;
}

/** Keys are sha256 hex; reject anything else before it reaches a filesystem path. */
export function assertBlobKey(key: string) {
	if (!/^[a-f0-9]{64}$/.test(key)) throw new Error(`Invalid blob key: ${key}`);
}

/** In-memory store for tests and as a last-resort fallback. Not durable. */
export function createMemoryFileStore(): FileStore {
	const blobs = new Map<string, Uint8Array>();
	return {
		name: "memory",
		async put(key, bytes) {
			assertBlobKey(key);
			if (!blobs.has(key)) blobs.set(key, bytes.slice());
		},
		async get(key) {
			return blobs.get(key)?.slice();
		},
		async has(key) {
			return blobs.has(key);
		},
		async delete(key) {
			blobs.delete(key);
		},
	};
}
