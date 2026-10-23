import type { FileStore } from "../../platform/files/fileStore";
import type { Db } from "../db/database";
import { sha256Hex } from "../ids";
import { blobRefRepository } from "../repositories/blobRefs";
import type { DataContext } from "./context";

/**
 * Explicit, confirmed storage cleanup for the active profile. Only bytes this person REMOVED from
 * a book are candidates, and a blob is freed only when the whole device database proves nothing
 * still uses it:
 * - no live (not removed) manifest row in ANY profile has the same sha256, and
 * - every `files` row in ANY profile pointing at it is the file of a removed manifest row and is
 *   not used by a note or any library book cover (soft-deleted books included, since they can be
 *   restored). Any other `files` row, including an unreferenced one such as a merge copy, keeps it.
 * If any of these reads fails, nothing is deleted. Both steps run inside the serialized write
 * queue, so no intake commit can interleave; intake re-checks its bytes inside its own commit.
 */
export type CleanupPlan = {
	/** Hash of the planned blob list. `runStorageCleanup` needs it so the person confirms THIS plan. */
	token: string;
	blobs: { sha: string; byteSize: number }[];
	totalBytes: number;
	/** Removed items whose bytes stay because something else still uses them. */
	keptInUse: number;
};

export type CleanupResult = {
	freed: number;
	freedBytes: number;
	/** In the confirmed plan but no longer safe (e.g. re-added since): kept. */
	skipped: number;
	/** Listed as freed only after the store confirms the bytes are gone. */
	failed: { sha: string; reason: string }[];
	/** True when storage changed since the person confirmed (only the safe overlap was freed). */
	planChanged: boolean;
};

async function computePlan(
	db: Db,
	files: FileStore,
	profileId: string,
): Promise<CleanupPlan> {
	const removed = await blobRefRepository.removedAssetsOf(db, profileId);
	const size = new Map<string, number>();
	for (const r of removed) size.set(r.sha, r.byteSize);
	const candidates = [...size.keys()].sort();
	const live = await blobRefRepository.liveAssetShas(db, candidates);
	const fileRows = await blobRefRepository.filesForBlobs(db, candidates);
	const ids = fileRows.map((f) => f.id);
	const usedElsewhere = await blobRefRepository.fileIdsReferencedElsewhere(
		db,
		ids,
	);
	const removedFiles = await blobRefRepository.fileIdsOfRemovedAssets(db, ids);
	const blocked = new Set(live);
	for (const f of fileRows)
		if (usedElsewhere.has(f.id) || !removedFiles.has(f.id))
			blocked.add(f.blobKey);
	const blobs: CleanupPlan["blobs"] = [];
	for (const sha of candidates) {
		if (blocked.has(sha)) continue;
		// Already gone (freed earlier, or cleared by the browser): nothing to free.
		if (await files.has(sha)) blobs.push({ sha, byteSize: size.get(sha) ?? 0 });
	}
	const token = await sha256Hex(
		new TextEncoder().encode(
			`${profileId}\n${blobs.map((b) => b.sha).join("\n")}`,
		),
	);
	return {
		token,
		blobs,
		totalBytes: blobs.reduce((n, b) => n + b.byteSize, 0),
		keptInUse: candidates.length - blobs.length,
	};
}

/** What a cleanup would free. Read-only; deletes nothing. */
export async function planStorageCleanup(
	ctx: DataContext,
	profileId: string,
): Promise<CleanupPlan> {
	return ctx.database.read((db) => computePlan(db, ctx.files, profileId));
}

/**
 * Frees the bytes of a plan the person confirmed. The plan is recomputed inside the write queue and
 * only blobs in BOTH the confirmed plan and the fresh plan are deleted, so anything re-added or
 * merged since the confirmation is kept. Returns what was actually freed.
 */
export async function runStorageCleanup(
	ctx: DataContext,
	profileId: string,
	confirmed: Pick<CleanupPlan, "token" | "blobs">,
): Promise<CleanupResult> {
	const confirmedShas = new Set(confirmed.blobs.map((b) => b.sha));
	return ctx.database.write(async (db) => {
		const fresh = await computePlan(db, ctx.files, profileId);
		const result: CleanupResult = {
			freed: 0,
			freedBytes: 0,
			skipped: 0,
			failed: [],
			planChanged: fresh.token !== confirmed.token,
		};
		const safe = new Set(fresh.blobs.map((b) => b.sha));
		for (const b of confirmed.blobs) if (!safe.has(b.sha)) result.skipped++;
		for (const b of fresh.blobs) {
			if (!confirmedShas.has(b.sha)) continue;
			try {
				await ctx.files.delete(b.sha);
				if (await ctx.files.has(b.sha))
					throw new Error("still present after delete");
				result.freed++;
				result.freedBytes += b.byteSize;
			} catch (error) {
				result.failed.push({
					sha: b.sha,
					reason: error instanceof Error ? error.message : String(error),
				});
			}
		}
		return result;
	});
}
