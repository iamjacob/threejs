import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebStore, loadData, openCtx } from "./data-helpers.mjs";

const data = await loadData();
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9]);

async function guestWithData(ctx) {
	const guest = await data.ensureActiveProfile(ctx);
	const a = await data.createNote(ctx, guest.id, { title: "Guest A", body: "a", clientKey: "k-a" });
	const b = await data.createNote(ctx, guest.id, { title: "Guest B", clientKey: "k-b" });
	await data.attachImage(ctx, guest.id, a.id, { bytes: png, mimeType: "image/png" });
	await data.deleteNote(ctx, guest.id, b.id);
	return { guest, a, b };
}

test("promote guest → new account copies everything and keeps guest rows", async () => {
	const { ctx } = await openCtx(data);
	const { guest } = await guestWithData(ctx);
	const report = await data.promoteGuest(ctx, guest.id, { kind: "new", displayName: "Ada" });
	assert.equal(report.notesCopied, 2, "includes the soft-deleted tombstone");
	assert.equal(report.filesCopied, 1);
	assert.deepEqual(report.skippedConflicts, []);
	const account = await data.ensureActiveProfile(ctx);
	assert.equal(account.id, report.targetProfileId, "account is now active");
	const notes = await data.listNotes(ctx, account.id);
	assert.deepEqual(notes.map((n) => n.title), ["Guest A"]);
	const { bytes } = await data.readFile(ctx, account.id, notes[0].fileId);
	assert.deepEqual(bytes, png, "copied metadata resolves to the shared blob");
	assert.equal((await data.listNotes(ctx, guest.id)).length, 1, "guest rows are NOT deleted");
	assert.deepEqual((await data.listProfiles(ctx)).map((p) => p.id), [account.id], "merged guest hidden from switcher");
});

test("retry / duplicate / concurrent promotion is idempotent", async () => {
	const { ctx } = await openCtx(data);
	const { guest } = await guestWithData(ctx);
	const first = await data.promoteGuest(ctx, guest.id, { kind: "new", displayName: "Ada" });
	const again = await data.promoteGuest(ctx, guest.id, { kind: "new", displayName: "Ada" });
	assert.equal(again.alreadyCompleted, true);
	assert.equal(again.targetProfileId, first.targetProfileId);
	const both = await Promise.all([
		data.promoteGuest(ctx, guest.id, { kind: "new", displayName: "Ada" }),
		data.promoteGuest(ctx, guest.id, { kind: "new", displayName: "Ada" }),
	]);
	assert.ok(both.every((r) => r.alreadyCompleted));
	const [{ c }] = await ctx.database.queryRaw("SELECT count(*) AS c FROM notes WHERE profile_id = ?", [first.targetProfileId]);
	assert.equal(c, 2, "nothing copied twice");
	const outbox = await data.pendingOutbox(ctx, first.targetProfileId);
	assert.equal(outbox.filter((e) => e.op === "merge").length, 1, "one merge outbox entry");
});

test("a failure mid-merge rolls back completely; a retry after restart succeeds", async () => {
	const store = createWebStore();
	const a = await openCtx(data, { store });
	const { guest } = await guestWithData(a.ctx);
	const failingVerify = async () => {
		throw new data.MergeVerificationError("simulated failure before commit");
	};
	await assert.rejects(
		data.promoteGuest(a.ctx, guest.id, { kind: "new", displayName: "Ada" }, { verify: failingVerify }),
		{ name: "MergeVerificationError" },
	);
	const b = await openCtx(data, { store }); // restart
	const stillGuest = await data.ensureActiveProfile(b.ctx);
	assert.equal(stillGuest.id, guest.id, "guest still active");
	assert.equal(stillGuest.mergedInto, null);
	assert.equal((await data.listProfiles(b.ctx)).length, 1, "no half-created account");
	assert.equal((await data.listNotes(b.ctx, guest.id)).length, 1, "guest data intact");
	const ok = await data.promoteGuest(b.ctx, guest.id, { kind: "new", displayName: "Ada" });
	assert.equal(ok.notesCopied, 2);
});

test("merge into an existing account: conflicting clientKey → target wins, reported", async () => {
	const { ctx } = await openCtx(data);
	const oldGuest = await data.ensureActiveProfile(ctx);
	await data.createNote(ctx, oldGuest.id, { title: "Account version", clientKey: "k-a" });
	const accountId = (await data.promoteGuest(ctx, oldGuest.id, { kind: "new", displayName: "Ada" })).targetProfileId;
	// A second guest on the same device (e.g. after signing out).
	await ctx.database.write((db) => db.run(data.sqlRaw("DELETE FROM app_state WHERE key = 'active_profile_id'")));
	const guest2 = await data.ensureActiveProfile(ctx);
	assert.notEqual(guest2.id, oldGuest.id);
	await data.createNote(ctx, guest2.id, { title: "Guest version", clientKey: "k-a" });
	await data.createNote(ctx, guest2.id, { title: "Only guest", clientKey: "k-new" });

	const report = await data.promoteGuest(ctx, guest2.id, { kind: "existing", profileId: accountId });
	assert.equal(report.notesCopied, 1);
	assert.equal(report.skippedConflicts.length, 1);
	const titles = (await data.listNotes(ctx, accountId)).map((n) => n.title).sort();
	assert.deepEqual(titles, ["Account version", "Only guest"], "target row not overwritten");
	assert.equal((await data.listNotes(ctx, guest2.id)).length, 2, "skipped guest row is kept on the guest");
	const retry = await data.promoteGuest(ctx, guest2.id, { kind: "existing", profileId: accountId });
	assert.equal(retry.alreadyCompleted, true);
	await assert.rejects(
		data.promoteGuest(ctx, guest2.id, { kind: "new", displayName: "Other" }),
		{ name: "ValidationError" },
		"an already-merged guest cannot be merged somewhere else",
	);
});

test("invalid promotions are rejected without side effects", async () => {
	const { ctx } = await openCtx(data);
	const guest = await data.ensureActiveProfile(ctx);
	await assert.rejects(data.promoteGuest(ctx, guest.id, { kind: "new", displayName: " " }), { name: "ValidationError" });
	await assert.rejects(data.promoteGuest(ctx, guest.id, { kind: "existing", profileId: guest.id }), { name: "ValidationError" });
	await assert.rejects(data.promoteGuest(ctx, guest.id, { kind: "existing", profileId: "acct-missing" }), { name: "NotFoundError" });
	await assert.rejects(data.promoteGuest(ctx, "nope", { kind: "new", displayName: "x" }), { name: "NotFoundError" });
	assert.equal((await data.listProfiles(ctx)).length, 1);
	assert.equal((await data.ensureActiveProfile(ctx)).id, guest.id);
});

test("account lookup seam is honest: unavailable, never a fake account", async () => {
	const result = await data.offlineAccountDirectory.lookup("ada@example.com");
	assert.equal(result.status, "unavailable");
});
