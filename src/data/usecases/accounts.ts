/**
 * Seam for finding a remote account. There is no server in this repository, so the only
 * implementation is honest about being unavailable. Do not add a fake "found" response.
 */
export type AccountLookup =
	| { status: "found"; remoteAccountId: string; displayName: string }
	| { status: "not_found" }
	| { status: "unavailable"; reason: "offline" | "not_configured" };

export interface AccountDirectory {
	lookup(email: string): Promise<AccountLookup>;
}

export const offlineAccountDirectory: AccountDirectory = {
	async lookup() {
		return {
			status: "unavailable",
			reason:
				typeof navigator !== "undefined" && navigator.onLine === false
					? "offline"
					: "not_configured",
		};
	},
};
