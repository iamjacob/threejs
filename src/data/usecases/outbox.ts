import { outboxRepository } from "../repositories/outbox";
import type { OutboxEntry } from "../schema";
import type { DataContext } from "./context";

/**
 * Sends one outbox entry. Must be idempotent on the receiving side: the same idempotencyKey can
 * arrive more than once (e.g. the app dies after the send but before markDone is flushed).
 */
export interface SyncTransport {
	readonly configured: boolean;
	send(entry: OutboxEntry): Promise<void>;
}

/** The only shipped transport. There is no server, so nothing is sent and rows stay pending. */
export const unconfiguredTransport: SyncTransport = {
	configured: false,
	async send() {
		throw new Error("No sync server configured");
	},
};

export const OUTBOX_MAX_ATTEMPTS = 8;

/**
 * Drains due outbox rows. Network calls happen *outside* any SQLite transaction, so local CRUD is
 * never blocked by a slow or offline network; each result is committed in its own small write.
 */
export async function drainOutbox(
	ctx: DataContext,
	transport: SyncTransport,
	{ limit = 20 } = {},
) {
	const result = { sent: 0, retried: 0, failed: 0, skipped: !transport.configured };
	if (!transport.configured) return result;
	const due = await ctx.database.read((db) => outboxRepository.due(db, ctx.clock(), limit));
	for (const entry of due) {
		try {
			await transport.send(entry);
			await ctx.database.write((db) => outboxRepository.markDone(db, entry.id, ctx.clock()));
			result.sent++;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await ctx.database.write((db) =>
				outboxRepository.markRetry(db, entry, message, ctx.clock(), OUTBOX_MAX_ATTEMPTS),
			);
			if (entry.attempts + 1 >= OUTBOX_MAX_ATTEMPTS) result.failed++;
			else result.retried++;
		}
	}
	return result;
}

export function pendingOutbox(ctx: DataContext, profileId: string) {
	return ctx.database.read((db) => outboxRepository.listForProfile(db, profileId));
}
