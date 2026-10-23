/**
 * Pure status rules for one library book. Each dimension is independent; nothing here collapses
 * them into one "synced" or "complete" flag. No I/O, so it runs under node --test.
 */
export type AssetView = {
	id: string;
	kind: "cover" | "page_scan" | "digital_file";
	pageIndex: number | null;
	sha256: string;
	intake: "saved" | "failed";
	/** True when the bytes are present in the FileStore AND hash to `sha256` (checked on read). */
	bytesOk: boolean;
};

export type SyncAck = {
	entity: "library_book" | "book_asset";
	entityId: string;
	ackedRevision: number | null;
	ackedSha256: string | null;
};

export type ContentState =
	| { kind: "none" }
	| { kind: "metadata_only"; covers: number }
	| {
			kind: "partial";
			pages: number;
			/** null when no expected page count is set (completeness is then unknowable). */
			expected: number | null;
			missing: number[];
	  }
	| { kind: "complete"; pages: number; expected: number };

export type RemoteState =
	| { kind: "not_configured" }
	| { kind: "local_only" }
	| { kind: "synced"; at: number }
	| { kind: "changed_since_sync" };

export type BookStatus = {
	localRecord: "saved" | "needs_attention";
	attention: string[];
	remote: { metadata: RemoteState; assets: Record<string, RemoteState> };
	content: ContentState;
	catalogIdentity: "unmatched" | "candidate" | "verified";
	/** No registry or chain integration exists: these are fixed until real ones do. */
	publicRegistration: "not_proposed";
	chainPublication: "not_submitted";
};

/** Content is "complete" only with an expected page count and a verified scan for every index. */
export function deriveContent(
	assets: readonly AssetView[],
	expectedPageCount: number | null,
): ContentState {
	const live = assets.filter((a) => a.intake === "saved" && a.bytesOk);
	const covers = live.filter((a) => a.kind === "cover").length;
	const pageIndexes = new Set(
		live
			.filter((a) => a.kind === "page_scan" && a.pageIndex !== null)
			.map((a) => a.pageIndex as number),
	);
	if (!pageIndexes.size)
		return covers ? { kind: "metadata_only", covers } : { kind: "none" };
	const expected =
		expectedPageCount && expectedPageCount > 0 ? expectedPageCount : null;
	if (expected === null)
		return {
			kind: "partial",
			pages: pageIndexes.size,
			expected: null,
			missing: [],
		};
	const missing: number[] = [];
	for (let i = 0; i < expected; i++) if (!pageIndexes.has(i)) missing.push(i);
	return missing.length
		? { kind: "partial", pages: pageIndexes.size, expected, missing }
		: { kind: "complete", pages: pageIndexes.size, expected };
}

/**
 * `configured`: whether any real sync target exists. Today there is none, so every record and
 * asset reads "not configured". The other branches exist so a future backend can only show
 * "synced" for an exact acknowledged revision/hash, and "changed" after a local edit.
 */
export function deriveRemote(
	configured: boolean,
	ack: (SyncAck & { ackedAt?: number }) | undefined,
	current: { revision?: number; sha256?: string },
): RemoteState {
	if (!configured) return { kind: "not_configured" };
	if (!ack) return { kind: "local_only" };
	const same =
		current.revision !== undefined
			? ack.ackedRevision === current.revision
			: ack.ackedSha256 === current.sha256;
	return same
		? { kind: "synced", at: ack.ackedAt ?? 0 }
		: { kind: "changed_since_sync" };
}

export function deriveBookStatus(input: {
	bookId: string;
	title: string;
	metadataRevision: number;
	expectedPageCount: number | null;
	catalogMatch: "unmatched" | "candidate" | "verified";
	assets: readonly AssetView[];
	acks: readonly (SyncAck & { ackedAt?: number })[];
	syncConfigured: boolean;
}): BookStatus {
	const attention: string[] = [];
	if (!input.title.trim()) attention.push("Title is missing.");
	const pageNumbers = new Map<number, number>();
	for (const a of input.assets) {
		if (a.intake === "failed")
			attention.push("An import did not finish. Retry or remove it.");
		else if (!a.bytesOk)
			attention.push(
				"A saved file is missing or damaged in this device's storage.",
			);
		if (a.kind === "page_scan" && a.intake === "saved" && a.pageIndex !== null)
			pageNumbers.set(a.pageIndex, (pageNumbers.get(a.pageIndex) ?? 0) + 1);
	}
	if ([...pageNumbers.values()].some((n) => n > 1))
		attention.push(
			"Two or more scans share a page number. Renumber them in the page list.",
		);
	const ackFor = (entity: SyncAck["entity"], id: string) =>
		input.acks.find((x) => x.entity === entity && x.entityId === id);
	const assets: Record<string, RemoteState> = {};
	for (const a of input.assets)
		assets[a.id] = deriveRemote(
			input.syncConfigured,
			ackFor("book_asset", a.id),
			{
				sha256: a.sha256,
			},
		);
	return {
		localRecord: attention.length ? "needs_attention" : "saved",
		attention: [...new Set(attention)],
		remote: {
			metadata: deriveRemote(
				input.syncConfigured,
				ackFor("library_book", input.bookId),
				{
					revision: input.metadataRevision,
				},
			),
			assets,
		},
		content: deriveContent(input.assets, input.expectedPageCount),
		catalogIdentity: input.catalogMatch,
		publicRegistration: "not_proposed",
		chainPublication: "not_submitted",
	};
}
