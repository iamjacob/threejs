import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebStore, loadData, openCtx } from "./data-helpers.mjs";
import { device, outboxCount } from "./shared-device-helpers.mjs";

const data = await loadData();

test("messaging needs both sides opted in; hidden targets look the same as missing ones", async () => {
	const { ctx, people } = await device(data, 2, { visible: false });
	const [a, b] = people;
	await assert.rejects(data.openLocalConversation(ctx, a.id, b.id), { name: "NotFoundError" });
	await data.setDeviceVisibility(ctx, b.id, { publicName: "Bee" });
	await assert.rejects(data.openLocalConversation(ctx, a.id, b.id), { name: "ValidationError", field: "visibility" });
	await assert.rejects(data.openLocalConversation(ctx, a.id, a.id), { name: "ValidationError" });
});

test("same-device message appears exactly once for both participants after restart, no network, never queued", async () => {
	const store = createWebStore();
	const { ctx, people } = await device(data, 2, { store });
	const [a, b] = people;
	const opened = await data.openLocalConversation(ctx, a.id, b.id);
	assert.equal(opened.created, true);
	assert.deepEqual(await data.openLocalConversation(ctx, b.id, a.id), { id: opened.id, created: false }, "same pair, same conversation");
	const before = await outboxCount(ctx);

	const sent = await data.sendLocalMessage(ctx, a.id, opened.id, { body: "hi P1", clientKey: "k1" });
	assert.equal(sent.created, true);
	assert.equal(sent.message.status, "saved");
	assert.equal(sent.message.scope, "local");
	const dup = await data.sendLocalMessage(ctx, a.id, opened.id, { body: "hi P1", clientKey: "k1" });
	assert.equal(dup.created, false, "double-submit stores one message");
	assert.equal(dup.message.id, sent.message.id);

	const r = await openCtx(data, { store }); // restart
	for (const viewer of [a.id, b.id])
		assert.deepEqual((await data.listMessages(r.ctx, viewer, opened.id)).map((m) => m.body), ["hi P1"]);
	const [summary] = await data.listConversations(r.ctx, b.id);
	assert.deepEqual(summary.others, [{ profileId: a.id, publicName: "P0" }], "public name only");
	assert.equal(summary.lastMessage.body, "hi P1");
	assert.equal(await outboxCount(r.ctx), before, "local messages are never queued for upload");
	const leaked = await r.ctx.database.queryRaw("SELECT count(*) AS c FROM outbox WHERE payload_json LIKE '%hi P1%' OR entity LIKE '%message%' OR entity LIKE '%conversation%'");
	assert.equal(leaked[0].c, 0);
});

test("a nonparticipant can neither list, read nor post in a conversation", async () => {
	const { ctx, guest, people } = await device(data, 3);
	const [a, b, c] = people;
	const { id } = await data.openLocalConversation(ctx, a.id, b.id);
	await data.sendLocalMessage(ctx, a.id, id, { body: "secret", clientKey: "s1" });
	assert.deepEqual(await data.listConversations(ctx, c.id), []);
	assert.deepEqual(await data.listConversations(ctx, guest.id), []);
	await assert.rejects(data.listMessages(ctx, c.id, id), { name: "NotFoundError" });
	await assert.rejects(data.listMessages(ctx, "ghost", id), { name: "NotFoundError" });
	await assert.rejects(data.sendLocalMessage(ctx, c.id, id, { body: "x", clientKey: "c1" }), { name: "NotFoundError" });
	await assert.rejects(data.listConversations(ctx, "ghost"), { name: "NotFoundError" });
	assert.equal((await data.listMessages(ctx, b.id, id)).length, 1);
});

test("ordering is deterministic for equal timestamps and never goes backwards", async () => {
	const { ctx, people, advance } = await device(data, 2);
	const [a, b] = people;
	const { id } = await data.openLocalConversation(ctx, a.id, b.id);
	await data.sendLocalMessage(ctx, a.id, id, { body: "one", clientKey: "1" });
	await data.sendLocalMessage(ctx, b.id, id, { body: "two", clientKey: "2" }); // same clock tick
	advance(-500); // device clock moved back
	await data.sendLocalMessage(ctx, a.id, id, { body: "three", clientKey: "3" });
	const msgs = await data.listMessages(ctx, a.id, id);
	assert.deepEqual(msgs.map((m) => m.body), ["one", "two", "three"]);
	assert.ok(msgs[2].createdAt >= msgs[1].createdAt);
	await assert.rejects(data.sendLocalMessage(ctx, a.id, id, { body: "   ", clientKey: "4" }), { name: "ValidationError" });
});

test("opting out keeps existing conversations for members but blocks new ones", async () => {
	const { ctx, people } = await device(data, 3);
	const [a, b, c] = people;
	const { id } = await data.openLocalConversation(ctx, a.id, b.id);
	await data.hideFromDevice(ctx, b.id);
	await data.sendLocalMessage(ctx, a.id, id, { body: "still here", clientKey: "x" });
	assert.equal((await data.listMessages(ctx, b.id, id)).length, 1);
	await assert.rejects(data.openLocalConversation(ctx, c.id, b.id), { name: "NotFoundError" });
});

test("a rejected send (clientKey reused elsewhere) stores nothing", async () => {
	const { ctx, people } = await device(data, 3);
	const [a, b, c] = people;
	const ab = (await data.openLocalConversation(ctx, a.id, b.id)).id;
	const ac = (await data.openLocalConversation(ctx, a.id, c.id)).id;
	await data.sendLocalMessage(ctx, a.id, ab, { body: "first", clientKey: "dupe" });
	await assert.rejects(data.sendLocalMessage(ctx, a.id, ac, { body: "reuse", clientKey: "dupe" }), { name: "ValidationError" });
	assert.equal((await data.listMessages(ctx, a.id, ac)).length, 0);
});

test("promoting the guest keeps other people's conversations intact (no cascade)", async () => {
	const { ctx, guest, people } = await device(data, 2);
	const { id } = await data.openLocalConversation(ctx, people[0].id, people[1].id);
	await data.sendLocalMessage(ctx, people[0].id, id, { body: "kept", clientKey: "k" });
	await data.promoteGuest(ctx, guest.id, { kind: "new", displayName: "Acct" });
	assert.equal((await data.listMessages(ctx, people[1].id, id)).length, 1);
});
