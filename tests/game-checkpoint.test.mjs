import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebStore, loadData, openCtx } from "./data-helpers.mjs";
import { HOME, newLoop, run } from "./game-helpers.mjs";

const data = await loadData();
const AREA = { home: HOME, maxDistance: 5000 };

test("checkpoint saved on pause is restored after restart (real SQLite path, profile-scoped)", async () => {
	const store = createWebStore();
	const a = await openCtx(data, { store });
	const { id: pid } = await data.ensureActiveProfile(a.ctx);
	assert.equal(await data.loadMapCheckpoint(a.ctx, pid, AREA), undefined, "nothing on first run");

	const { loop } = newLoop();
	loop.dispatch({ type: "steer", x: 0.3, y: 1 });
	run(loop, 2, 60);
	loop.pause("user");
	const { written, checkpoint } = await data.saveMapCheckpoint(a.ctx, pid, loop.world.player.position);
	assert.equal(written, true);

	const b = await openCtx(data, { store }); // app restart
	const restored = await data.loadMapCheckpoint(b.ctx, pid, AREA);
	assert.deepEqual(restored, checkpoint);
	const next = newLoop();
	next.loop.dispatch({ type: "teleport", position: restored });
	assert.equal(next.loop.world.player.position.lat, loop.world.player.position.lat);
});

test("repeated pauses without movement do not rewrite the checkpoint", async () => {
	const { ctx, store } = await openCtx(data);
	const { id: pid } = await data.ensureActiveProfile(ctx);
	const first = await data.saveMapCheckpoint(ctx, pid, HOME);
	const saves = store.saves;
	const again = await data.saveMapCheckpoint(ctx, pid, { ...HOME }, first.checkpoint);
	assert.equal(again.written, false);
	assert.equal(store.saves, saves, "no database write or flush");
});

test("checkpoints are per profile: another profile never sees this position", async () => {
	const { ctx } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	await data.saveMapCheckpoint(ctx, guest.id, { lng: 9.56, lat: 55.71 });
	await data.promoteGuest(ctx, guest.id, { kind: "new", displayName: "Ada" });
	const account = await data.ensureActiveProfile(ctx);
	assert.equal(await data.loadMapCheckpoint(ctx, account.id, AREA), undefined);
	assert.ok(await data.loadMapCheckpoint(ctx, guest.id, AREA));
});

test("invalid or out-of-area stored checkpoints are ignored, never applied", async () => {
	const { ctx } = await openCtx(data);
	const { id: pid } = await data.ensureActiveProfile(ctx);
	const put = (value) => ctx.database.write((db) => data.settingsRepository.set(db, pid, data.CHECKPOINT_KEY, value, 1));
	for (const bad of [null, "x", { v: 1, lng: "9", lat: 55, savedAt: 1 }, { v: 2, lng: 9.5, lat: 55.7, savedAt: 1 }, { v: 1, lng: 9.5, lat: 95, savedAt: 1 }]) {
		await put(bad);
		assert.equal(await data.loadMapCheckpoint(ctx, pid, AREA), undefined, JSON.stringify(bad));
	}
	await put({ v: 1, lng: 12.568, lat: 55.676, savedAt: 1 }); // Copenhagen: outside the 5 km area
	assert.equal(await data.loadMapCheckpoint(ctx, pid, AREA), undefined);
	await assert.rejects(data.saveMapCheckpoint(ctx, pid, { lng: Number.NaN, lat: 1 }));
});

test("movement itself never writes: 10 s of play performs zero database writes", async () => {
	const { ctx, store } = await openCtx(data);
	await data.ensureActiveProfile(ctx);
	const saves = store.saves;
	const { loop } = newLoop();
	loop.dispatch({ type: "steer", x: 1, y: 1 });
	run(loop, 10, 60);
	assert.equal(store.saves, saves, "simulation has no persistence path");
});
