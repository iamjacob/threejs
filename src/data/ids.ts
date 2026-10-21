/** Injectable id/time sources so use cases are deterministic in tests. */
export type Clock = () => number;
export type IdFactory = () => string;

export const systemClock: Clock = () => Date.now();
export const randomId: IdFactory = () => crypto.randomUUID();

/** SHA-256 hex of bytes. Used for content-addressed blob keys. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		bytes as Uint8Array<ArrayBuffer>,
	);
	return Array.from(new Uint8Array(digest), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}
