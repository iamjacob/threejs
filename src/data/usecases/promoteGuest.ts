import { eq } from "drizzle-orm";
import type { Db } from "../db/database";
import { profileRepository } from "../repositories/profiles";
import { type Profile, profileMerges } from "../schema";
import { type DataContext, NotFoundError, ValidationError } from "./context";
import {
	copyRows,
	type MergeReport,
	mergeIdFor,
	newAccountIdFor,
	verifyMerge,
} from "./mergeRows";
import { recordChange } from "./notes";

export type { MergeReport } from "./mergeRows";
export { MergeVerificationError } from "./mergeRows";

export type PromotionTarget =
	| { kind: "new"; displayName: string; remoteAccountId?: string }
	| { kind: "existing"; profileId: string };

/**
 * Promotes a guest into a new or existing account profile on this device, in ONE transaction:
 * copy → verify → mark merged → record. Any error rolls everything back, so guest data is never
 * lost or half-moved. Guest rows are kept (archived via `merged_into`), never deleted here.
 * Retries and duplicate calls are safe: a completed merge returns its stored report.
 */
export async function promoteGuest(
	ctx: DataContext,
	guestId: string,
	target: PromotionTarget,
	{ verify = verifyMerge }: { verify?: typeof verifyMerge } = {},
): Promise<MergeReport> {
	if (target.kind === "new" && !target.displayName.trim())
		throw new ValidationError("Account name is required", "displayName");

	return ctx.database.write(async (db) => {
		const guest = await profileRepository.get(db, guestId);
		if (!guest) throw new NotFoundError("Guest profile");
		if (guest.kind !== "guest")
			throw new ValidationError("Only guests can be promoted", "guestId");

		const targetId =
			target.kind === "new" ? newAccountIdFor(guestId) : target.profileId;
		if (targetId === guestId)
			throw new ValidationError(
				"Cannot merge a profile into itself",
				"profileId",
			);
		const mergeId = mergeIdFor(guestId, targetId);

		const done = await db
			.select()
			.from(profileMerges)
			.where(eq(profileMerges.id, mergeId))
			.get();
		if (done) {
			await profileRepository.setActiveId(db, targetId);
			const stored = JSON.parse(done.reportJson) as MergeReport;
			return { ...stored, alreadyCompleted: true };
		}
		if (guest.mergedInto)
			throw new ValidationError(
				`Guest was already merged into ${guest.mergedInto}`,
				"guestId",
			);

		const now = ctx.clock();
		const account = await ensureTarget(db, target, targetId, now);
		const report = await copyRows(db, mergeId, guest, account, now);
		await verify(db, mergeId, guest.id, account.id, report);

		await profileRepository.markMerged(db, guest.id, account.id, now);
		await profileRepository.setActiveId(db, account.id);
		await db.insert(profileMerges).values({
			id: mergeId,
			sourceProfileId: guest.id,
			targetProfileId: account.id,
			status: "completed",
			reportJson: JSON.stringify(report),
			createdAt: now,
			updatedAt: now,
		});
		await recordChange(
			ctx,
			db,
			{
				profileId: account.id,
				entity: "profile",
				entityId: account.id,
				op: "merge",
				idempotencyKey: mergeId,
				payload: { sourceProfileId: guest.id, report },
			},
			now,
		);
		return report;
	});
}

async function ensureTarget(
	db: Db,
	target: PromotionTarget,
	targetId: string,
	now: number,
): Promise<Profile> {
	const existing = await profileRepository.get(db, targetId);
	if (target.kind === "existing") {
		if (!existing) throw new NotFoundError("Account profile");
		if (existing.kind !== "account" || existing.mergedInto)
			throw new ValidationError(
				"Target must be an active account",
				"profileId",
			);
		return existing;
	}
	if (existing) return existing;
	const account: Profile = {
		id: targetId,
		kind: "account",
		displayName: target.displayName.trim(),
		remoteAccountId: target.remoteAccountId ?? null,
		mergedInto: null,
		createdAt: now,
		updatedAt: now,
	};
	await profileRepository.insert(db, account);
	return account;
}
