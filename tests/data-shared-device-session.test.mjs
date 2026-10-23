import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "./data-helpers.mjs";
import { device } from "./shared-device-helpers.mjs";

const data = await loadData();
const { onProfileSession, switchActiveProfile, currentGeneration } = data.profileSession;

test("session switch: subscribers clear BEFORE the switch is persisted, then get the new profile", async () => {
	const { ctx, guest, people } = await device(data, 2);
	const log = [];
	const off = onProfileSession(async (e) => {
		// At "clear" the database must still say the previous profile: nothing has loaded yet.
		const active = await data.getActiveProfileId(ctx);
		log.push(e.phase === "clear" ? ["clear", active] : ["ready", e.profile.id]);
	});
	await switchActiveProfile(ctx, people[0].id);
	await switchActiveProfile(ctx, people[1].id);
	await new Promise((r) => setTimeout(r, 10));
	off();
	assert.deepEqual(log, [
		["clear", guest.id],
		["ready", people[0].id],
		["clear", people[0].id],
		["ready", people[1].id],
	]);
});

test("rapid switches: only the newest switch emits ready; stale loads can detect it", async () => {
	const { ctx, people } = await device(data, 3);
	const ready = [];
	const off = onProfileSession((e) => e.phase === "ready" && ready.push(e.profile.id));
	const start = currentGeneration();
	await Promise.all(people.map((p) => switchActiveProfile(ctx, p.id)));
	off();
	assert.equal(currentGeneration(), start + 3);
	assert.deepEqual(ready, [people[2].id], "earlier switches never announce a profile");
	assert.equal(await data.getActiveProfileId(ctx), people[2].id);
});

test("a failed switch reopens the profile that is really active (no guess, no leak)", async () => {
	const { ctx, people } = await device(data, 1);
	await switchActiveProfile(ctx, people[0].id);
	const events = [];
	const off = onProfileSession((e) => events.push(e.phase === "ready" ? e.profile.id : "clear"));
	await assert.rejects(switchActiveProfile(ctx, "deleted-profile"), { name: "NotFoundError" });
	off();
	assert.deepEqual(events, ["clear", people[0].id]);
});
