import type { Db } from "../db/database";
import {
	conversationRepository,
	directoryRepository,
	messageRepository,
} from "../repositories/sharedDevice";
import type { Message } from "../schema";
import { type DataContext, NotFoundError, ValidationError } from "./context";
import { requireProfile } from "./localProfiles";

/**
 * Same-device conversations (migration 0003). Everything lives only in this database. Nothing here
 * writes to the outbox, so the sync boundary can never upload a shared-device message.
 * Status 'saved' = committed and flushed on this device; there are no delivery/read receipts.
 */

export const MESSAGE_BODY_MAX = 2_000;

export type ConversationSummary = {
	id: string;
	scope: "local";
	/** Other participants, by the public name they had when the conversation started. */
	others: { profileId: string; publicName: string }[];
	lastMessage?: Pick<Message, "body" | "authorProfileId" | "createdAt">;
	updatedAt: number;
};

/** Stable, order-independent pair id, so opening twice (or from either side) is idempotent. */
export function localPairConversationId(a: string, b: string) {
	const [x, y] = [a, b].sort();
	return `local-dm:${x}|${y}`;
}

/** Membership check for every content read/write. Non-members get NotFound (nothing leaks). */
async function requireMember(
	db: Db,
	conversationId: string,
	profileId: string,
) {
	const member = await conversationRepository.membership(
		db,
		conversationId,
		profileId,
	);
	if (!member) throw new NotFoundError("Conversation");
	await requireProfile(db, profileId).catch(() => {
		throw new NotFoundError("Conversation");
	});
	return member;
}

/**
 * Opens (or creates once) the same-device conversation with another profile. Creating requires
 * BOTH to be opted in, so each side only sees the name the other chose to show. An existing
 * conversation stays readable by its members after either side opts out (product decision).
 */
export async function openLocalConversation(
	ctx: DataContext,
	viewerProfileId: string,
	otherProfileId: string,
): Promise<{ id: string; created: boolean }> {
	if (viewerProfileId === otherProfileId)
		throw new ValidationError("You cannot message yourself", "otherProfileId");
	const id = localPairConversationId(viewerProfileId, otherProfileId);
	return ctx.database.write(async (db) => {
		await requireProfile(db, viewerProfileId);
		if (await conversationRepository.membership(db, id, viewerProfileId))
			return { id, created: false };
		const theirs = await directoryRepository.get(db, otherProfileId);
		// Same error for missing, archived and hidden: hidden profiles are not revealed.
		if (!theirs) throw new NotFoundError("Person on this device");
		await requireProfile(db, otherProfileId).catch(() => {
			throw new NotFoundError("Person on this device");
		});
		const mine = await directoryRepository.get(db, viewerProfileId);
		if (!mine)
			throw new ValidationError(
				"Turn on your visibility on this device before messaging someone",
				"visibility",
			);
		const now = ctx.clock();
		await conversationRepository.insert(db, {
			id,
			scope: "local",
			createdByProfileId: viewerProfileId,
			createdAt: now,
			updatedAt: now,
		});
		for (const m of [mine, theirs])
			await conversationRepository.addMember(db, {
				conversationId: id,
				profileId: m.profileId,
				publicName: m.publicName,
				joinedAt: now,
			});
		return { id, created: true };
	});
}

/** Conversations the viewer is a member of. Never returns anyone else's conversations. */
export async function listConversations(
	ctx: DataContext,
	viewerProfileId: string,
): Promise<ConversationSummary[]> {
	return ctx.database.read(async (db) => {
		await requireProfile(db, viewerProfileId);
		const rows = await conversationRepository.listForMember(
			db,
			viewerProfileId,
		);
		const members = await conversationRepository.membersOf(
			db,
			rows.map((r) => r.id),
		);
		const result: ConversationSummary[] = [];
		for (const row of rows) {
			const last = await messageRepository.last(db, row.id);
			result.push({
				id: row.id,
				scope: row.scope,
				others: members
					.filter(
						(m) =>
							m.conversationId === row.id && m.profileId !== viewerProfileId,
					)
					.map((m) => ({ profileId: m.profileId, publicName: m.publicName })),
				lastMessage: last && {
					body: last.body,
					authorProfileId: last.authorProfileId,
					createdAt: last.createdAt,
				},
				updatedAt: row.updatedAt,
			});
		}
		return result;
	});
}

/** Messages in (created_at, id) order. Members only. */
export async function listMessages(
	ctx: DataContext,
	viewerProfileId: string,
	conversationId: string,
): Promise<Message[]> {
	return ctx.database.read(async (db) => {
		await requireMember(db, conversationId, viewerProfileId);
		return messageRepository.list(db, conversationId);
	});
}

/**
 * Saves a same-device message in one transaction and resolves only after the write is durable
 * (Database.write flushes; on web that means IndexedDB). The same clientKey stores one message,
 * so retries and double-submits are safe.
 */
export async function sendLocalMessage(
	ctx: DataContext,
	viewerProfileId: string,
	conversationId: string,
	input: { body: string; clientKey: string },
): Promise<{ message: Message; created: boolean }> {
	const body = input.body?.trim() ?? "";
	if (!body) throw new ValidationError("Message is empty", "body");
	if (body.length > MESSAGE_BODY_MAX)
		throw new ValidationError(
			`Message is over ${MESSAGE_BODY_MAX} characters`,
			"body",
		);
	if (!input.clientKey)
		throw new ValidationError("clientKey is required", "clientKey");
	return ctx.database.write(async (db) => {
		await requireMember(db, conversationId, viewerProfileId);
		const existing = await messageRepository.getByClientKey(
			db,
			viewerProfileId,
			input.clientKey,
		);
		if (existing) {
			if (existing.conversationId !== conversationId)
				throw new ValidationError("clientKey already used", "clientKey");
			return { message: existing, created: false };
		}
		const last = await messageRepository.last(db, conversationId);
		// Never earlier than the last message, even if the device clock moved back.
		const now = Math.max(ctx.clock(), last?.createdAt ?? 0);
		const message: Message = {
			id: ctx.newId(),
			conversationId,
			authorProfileId: viewerProfileId,
			clientKey: input.clientKey,
			body,
			scope: "local",
			status: "saved",
			createdAt: now,
		};
		await messageRepository.insertIfAbsent(db, message);
		await conversationRepository.touch(db, conversationId, now);
		return { message, created: true };
	});
}
