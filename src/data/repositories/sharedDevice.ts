import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { affectedRows, type Db } from "../db/database";
import {
	type Conversation,
	type ConversationMember,
	conversationMembers,
	conversations,
	type DeviceDirectoryRow,
	deviceDirectory,
	type Message,
	messages,
	profiles,
} from "../schema";

/** Consented directory rows. Only `public_name` is ever selected for other profiles. */
export const directoryRepository = {
	get(db: Db, profileId: string): Promise<DeviceDirectoryRow | undefined> {
		return db
			.select()
			.from(deviceDirectory)
			.where(eq(deviceDirectory.profileId, profileId))
			.get();
	},
	async upsert(db: Db, profileId: string, publicName: string, now: number) {
		await db
			.insert(deviceDirectory)
			.values({ profileId, publicName, createdAt: now, updatedAt: now })
			.onConflictDoUpdate({
				target: deviceDirectory.profileId,
				set: { publicName, updatedAt: now },
			});
	},
	/** Removes only the directory row. Profile, books, notes and conversations are untouched. */
	async remove(db: Db, profileId: string) {
		await db
			.delete(deviceDirectory)
			.where(eq(deviceDirectory.profileId, profileId));
	},
	/** Opted-in, non-archived profiles other than the viewer. Selects public fields only. */
	listVisible(
		db: Db,
		viewerProfileId: string,
	): Promise<{ profileId: string; publicName: string }[]> {
		return db
			.select({
				profileId: deviceDirectory.profileId,
				publicName: deviceDirectory.publicName,
			})
			.from(deviceDirectory)
			.innerJoin(profiles, eq(profiles.id, deviceDirectory.profileId))
			.where(
				and(
					ne(deviceDirectory.profileId, viewerProfileId),
					isNull(profiles.mergedInto),
				),
			)
			.orderBy(asc(deviceDirectory.publicName), asc(deviceDirectory.profileId))
			.all();
	},
};

/** Every read that returns conversation content takes the viewer and checks membership. */
export const conversationRepository = {
	getById(db: Db, id: string): Promise<Conversation | undefined> {
		return db
			.select()
			.from(conversations)
			.where(eq(conversations.id, id))
			.get();
	},
	membership(
		db: Db,
		conversationId: string,
		profileId: string,
	): Promise<ConversationMember | undefined> {
		return db
			.select()
			.from(conversationMembers)
			.where(
				and(
					eq(conversationMembers.conversationId, conversationId),
					eq(conversationMembers.profileId, profileId),
				),
			)
			.get();
	},
	async insert(db: Db, conversation: Conversation) {
		await db.insert(conversations).values(conversation);
	},
	async addMember(db: Db, member: ConversationMember) {
		await db
			.insert(conversationMembers)
			.values(member)
			.onConflictDoNothing()
			.run();
	},
	async touch(db: Db, id: string, now: number) {
		await db
			.update(conversations)
			.set({ updatedAt: now })
			.where(eq(conversations.id, id));
	},
	/** Conversations the viewer is a member of, most recently active first (id as tie-break). */
	listForMember(db: Db, profileId: string): Promise<Conversation[]> {
		return db
			.select({
				id: conversations.id,
				scope: conversations.scope,
				createdByProfileId: conversations.createdByProfileId,
				createdAt: conversations.createdAt,
				updatedAt: conversations.updatedAt,
			})
			.from(conversations)
			.innerJoin(
				conversationMembers,
				eq(conversationMembers.conversationId, conversations.id),
			)
			.where(eq(conversationMembers.profileId, profileId))
			.orderBy(desc(conversations.updatedAt), asc(conversations.id))
			.all();
	},
	/** Members of the given conversations. Callers must pass only ids the viewer belongs to. */
	membersOf(db: Db, ids: string[]): Promise<ConversationMember[]> {
		if (!ids.length) return Promise.resolve([]);
		return db
			.select()
			.from(conversationMembers)
			.where(inArray(conversationMembers.conversationId, ids))
			.orderBy(
				asc(conversationMembers.conversationId),
				asc(conversationMembers.profileId),
			)
			.all();
	},
};

export const messageRepository = {
	/** Deterministic order: created_at, then id for equal timestamps. */
	list(db: Db, conversationId: string): Promise<Message[]> {
		return db
			.select()
			.from(messages)
			.where(eq(messages.conversationId, conversationId))
			.orderBy(asc(messages.createdAt), asc(messages.id))
			.all();
	},
	last(db: Db, conversationId: string): Promise<Message | undefined> {
		return db
			.select()
			.from(messages)
			.where(eq(messages.conversationId, conversationId))
			.orderBy(desc(messages.createdAt), desc(messages.id))
			.limit(1)
			.get();
	},
	getByClientKey(
		db: Db,
		authorProfileId: string,
		clientKey: string,
	): Promise<Message | undefined> {
		return db
			.select()
			.from(messages)
			.where(
				and(
					eq(messages.authorProfileId, authorProfileId),
					eq(messages.clientKey, clientKey),
				),
			)
			.get();
	},
	async insertIfAbsent(db: Db, message: Message): Promise<boolean> {
		const result = await db
			.insert(messages)
			.values(message)
			.onConflictDoNothing()
			.run();
		return affectedRows(result) > 0;
	},
};
