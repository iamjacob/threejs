import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebStore, loadData, openCtx } from "./data-helpers.mjs";

const data = await loadData();

test("every mutation records exactly one outbox row in the same transaction", async () => {
	const { ctx } = await openCtx(data);
	const { id: pid } = await data.ensureActiveProfile(ctx);
	const n = await data.createNote(ctx, pid, { title: "A" });
	await data.updateNote(ctx, pid, n.id, { title: "B" });
	await data.deleteNote(ctx, pid, n.id);
	const rows = await data.pendingOutbox(ctx, pid);
	assert.deepEqual(rows.map((r) => r.op), ["create", "update", "delete"]);
	assert.ok(rows.every((r) => r.status === "pending" && r.attempts === 0));
	assert.equal(new Set(rows.map((r) => r.idempotencyKey)).size, 3);
});

test("a failed data write leaves no outbox row (atomic with the change)", async () => {
	const { ctx } = await openCtx(data);
	const { id: pid } = await data.ensureActiveProfile(ctx);
	await assert.rejects(data.createNote(ctx, "missing-profile", { title: "x" }));
	assert.equal((await data.pendingOutbox(ctx, "missing-profile")).length, 0);
	assert.equal((await data.pendingOutbox(ctx, pid)).length, 0);
});

test("no server: the shipped transport sends nothing and never blocks CRUD", async () => {
	const { ctx } = await openCtx(data);
	const { id: pid } = await data.ensureActiveProfile(ctx);
	await data.createNote(ctx, pid, { title: "Offline" });
	const result = await data.drainOutbox(ctx, data.unconfiguredTransport);
	assert.equal(result.skipped, true);
	assert.equal((await data.pendingOutbox(ctx, pid))[0].status, "pending");
});

test("retry with backoff, then success; local CRUD continues while the network hangs", async () => {
	const store = createWebStore();
	const a = await openCtx(data, { store });
	const { id: pid } = await data.ensureActiveProfile(a.ctx);
	await data.createNote(a.ctx, pid, { title: "Sync me" });

	const received = [];
	let mode = "fail";
	let release;
	const transport = {
		configured: true,
		async send(entry) {
			if (mode === "fail") throw new Error("503 from server");
			if (mode === "hang") await new Promise((r) => { release = r; });
			received.push(entry.idempotencyKey);
		},
	};

	const r1 = await data.drainOutbox(a.ctx, transport);
	assert.deepEqual([r1.sent, r1.retried], [0, 1]);
	let [row] = await data.pendingOutbox(a.ctx, pid);
	assert.equal(row.attempts, 1);
	assert.match(row.lastError, /503/);
	assert.equal(row.nextAttemptAt, 1_000 + 2_000, "2s backoff after first failure");

	const r2 = await data.drainOutbox(a.ctx, transport);
	assert.equal(r2.sent + r2.retried, 0, "not due yet");

	a.advance(2_000);
	mode = "hang";
	const draining = data.drainOutbox(a.ctx, transport);
	await new Promise((r) => setTimeout(r, 10));
	// While send() is in flight, a local write still completes (no transaction is held).
	await data.createNote(a.ctx, pid, { title: "Written while syncing" });
	release();
	const r3 = await draining;
	assert.equal(r3.sent, 1);

	const b = await openCtx(data, { store }); // restart: status survived
	const rows = await data.pendingOutbox(b.ctx, pid);
	assert.equal(rows.find((r) => r.idempotencyKey === row.idempotencyKey).status, "done");
	assert.equal(rows.filter((r) => r.status === "pending").length, 1, "the new note is queued");
	assert.deepEqual(received, [row.idempotencyKey]);
});

test("permanent failures stop after max attempts and are marked failed", async () => {
	const { ctx, advance } = await openCtx(data);
	const { id: pid } = await data.ensureActiveProfile(ctx);
	await data.createNote(ctx, pid, { title: "Doomed" });
	const transport = { configured: true, async send() { throw new Error("400 invalid"); } };
	for (let i = 0; i < data.OUTBOX_MAX_ATTEMPTS; i++) {
		await data.drainOutbox(ctx, transport);
		advance(3_600_000);
	}
	const [row] = await data.pendingOutbox(ctx, pid);
	assert.equal(row.status, "failed");
	assert.equal(row.attempts, data.OUTBOX_MAX_ATTEMPTS);
	assert.equal((await data.drainOutbox(ctx, transport)).retried, 0, "failed rows are not retried forever");
});

test("settings seam (for boooks-shelf-level later) is profile-scoped and persistent", async () => {
	const store = createWebStore();
	const a = await openCtx(data, { store });
	const { id: pid } = await data.ensureActiveProfile(a.ctx);
	await a.ctx.database.write((db) => data.settingsRepository.set(db, pid, "shelf.libraryLevel", 7, 1));
	const b = await openCtx(data, { store });
	assert.equal(await b.ctx.database.read((db) => data.settingsRepository.get(db, pid, "shelf.libraryLevel")), 7);
	assert.equal(await b.ctx.database.read((db) => data.settingsRepository.get(db, "other", "shelf.libraryLevel")), undefined);
});
