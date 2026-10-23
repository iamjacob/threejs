import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "./data-helpers.mjs";
import { device } from "./shared-device-helpers.mjs";

const data = await loadData();

test("directory: opt-in shows only the chosen public name; opt-out disappears; data kept", async () => {
	const { ctx, guest, people } = await device(data, 2, { visible: false });
	const [ada, bo] = people;
	await data.createNote(ctx, ada.id, { title: "Ada's private note" });
	await data.setDeviceVisibility(ctx, ada.id, { publicName: "  Ada  " });

	const seen = await data.listDeviceDirectory(ctx, guest.id);
	assert.deepEqual(seen, [{ origin: "this_device", profileId: ada.id, publicName: "Ada" }], "public fields only; Bo absent");
	assert.equal(JSON.stringify(seen).includes("Private"), false, "private display name never exposed");
	assert.deepEqual(await data.listDeviceDirectory(ctx, ada.id), [], "you do not see yourself");

	await data.hideFromDevice(ctx, ada.id);
	assert.deepEqual(await data.listDeviceDirectory(ctx, bo.id), [], "removed from future lookups");
	assert.equal((await data.getDeviceVisibility(ctx, ada.id)).visible, false);
	assert.equal((await data.listNotes(ctx, ada.id)).length, 1, "opting out deletes nothing");
	assert.ok((await data.listProfiles(ctx)).some((p) => p.id === ada.id));
	await assert.rejects(data.setDeviceVisibility(ctx, ada.id, { publicName: " " }), { name: "ValidationError" });
});

test("archived (merged) or missing profiles are never listed or messageable", async () => {
	const { ctx, guest, people } = await device(data, 1);
	await data.setDeviceVisibility(ctx, guest.id, { publicName: "G" });
	await data.promoteGuest(ctx, guest.id, { kind: "new", displayName: "Acct" });
	assert.deepEqual(await data.listDeviceDirectory(ctx, people[0].id), [], "merged guest hidden");
	await assert.rejects(data.openLocalConversation(ctx, people[0].id, guest.id), { name: "NotFoundError" });
	await assert.rejects(data.openLocalConversation(ctx, people[0].id, "nope"), { name: "NotFoundError" });
	await assert.rejects(data.listDeviceDirectory(ctx, "nope"), { name: "NotFoundError" });
});

test("switching profiles repeatedly never exposes another profile's rows; nothing deleted", async () => {
	const { ctx, guest, people } = await device(data, 3);
	for (const p of people) await data.createNote(ctx, p.id, { title: `mine:${p.id}` });
	const { id } = await data.openLocalConversation(ctx, people[0].id, people[1].id);
	await data.sendLocalMessage(ctx, people[0].id, id, { body: "hello", clientKey: "h" });
	for (let round = 0; round < 3; round++) {
		for (const p of [...people, guest]) {
			await data.switchProfile(ctx, p.id);
			const active = await data.getActiveProfileId(ctx);
			assert.equal(active, p.id);
			assert.ok((await data.listNotes(ctx, active)).every((n) => n.profileId === active));
			const member = p.id === people[0].id || p.id === people[1].id;
			assert.equal((await data.listConversations(ctx, active)).length, member ? 1 : 0);
		}
	}
	assert.equal((await data.listProfiles(ctx)).length, 4, "switching deletes nothing");
	await assert.rejects(data.switchProfile(ctx, "missing"), { name: "NotFoundError" });
});

test("a missing active profile never falls back to another person's profile", async () => {
	const { ctx, people } = await device(data, 2);
	await data.createNote(ctx, people[0].id, { title: "p0 private" });
	await data.switchProfile(ctx, people[0].id);
	await ctx.database.write((db) => db.run(data.sqlRaw("UPDATE app_state SET value = 'vanished' WHERE key = 'active_profile_id'")));
	const opened = await data.ensureActiveProfile(ctx);
	assert.ok(!people.some((p) => p.id === opened.id), "did not silently open someone else");
	assert.equal(opened.kind, "guest");
	assert.deepEqual(await data.listNotes(ctx, opened.id), []);
	assert.equal((await data.listNotes(ctx, people[0].id)).length, 1, "the other person's data is intact");
});
