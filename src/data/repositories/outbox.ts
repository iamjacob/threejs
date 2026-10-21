import { and, asc, eq, lte } from "drizzle-orm";
import { affectedRows, type Db } from "../db/database";
import { type OutboxEntry, outbox } from "../schema";

export type OutboxChange = Pick<
	OutboxEntry,
	"profileId" | "entity" | "entityId" | "op" | "idempotencyKey"
> & { payload: unknown };

export const outboxRepository = {
	/** Idempotent: the same idempotencyKey is recorded once. Returns true if newly recorded. */
	async record(db: Db, change: OutboxChange, id: string, now: number) {
		const result = await db
			.insert(outbox)
			.values({
				id,
				profileId: change.profileId,
				entity: change.entity,
				entityId: change.entityId,
				op: change.op,
				payloadJson: JSON.stringify(change.payload),
				idempotencyKey: change.idempotencyKey,
				status: "pending",
				attempts: 0,
				nextAttemptAt: now,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing({ target: outbox.idempotencyKey })
			.run();
		return affectedRows(result) > 0;
	},
	due(db: Db, now: number, limit: number): Promise<OutboxEntry[]> {
		return db
			.select()
			.from(outbox)
			.where(and(eq(outbox.status, "pending"), lte(outbox.nextAttemptAt, now)))
			.orderBy(asc(outbox.createdAt), asc(outbox.id))
			.limit(limit)
			.all();
	},
	listForProfile(db: Db, profileId: string): Promise<OutboxEntry[]> {
		return db
			.select()
			.from(outbox)
			.where(eq(outbox.profileId, profileId))
			.orderBy(asc(outbox.createdAt), asc(outbox.id))
			.all();
	},
	async markDone(db: Db, id: string, now: number) {
		await db
			.update(outbox)
			.set({ status: "done", updatedAt: now, lastError: null })
			.where(eq(outbox.id, id));
	},
	async markRetry(
		db: Db,
		entry: OutboxEntry,
		error: string,
		now: number,
		maxAttempts: number,
	) {
		const attempts = entry.attempts + 1;
		// Exponential backoff: 2s, 4s, 8s … capped at 1h.
		const delay = Math.min(2 ** attempts * 1000, 3_600_000);
		await db
			.update(outbox)
			.set({
				attempts,
				lastError: error.slice(0, 500),
				status: attempts >= maxAttempts ? "failed" : "pending",
				nextAttemptAt: now + delay,
				updatedAt: now,
			})
			.where(eq(outbox.id, entry.id));
	},
};
