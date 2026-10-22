// Fixtures for shared-device (migration 0003) tests.
import { openCtx } from "./data-helpers.mjs";

/** A device with the guest plus `n` local people; opted in as "P<i>" unless visible=false. */
export async function device(data, n, { visible = true, store } = {}) {
	const h = await openCtx(data, store ? { store } : {});
	const guest = await data.ensureActiveProfile(h.ctx);
	const people = [];
	for (let i = 0; i < n; i++) {
		const p = await data.createLocalProfile(h.ctx, {
			displayName: `Private ${i}`,
		});
		if (visible)
			await data.setDeviceVisibility(h.ctx, p.id, { publicName: `P${i}` });
		people.push(p);
	}
	return { ...h, guest, people };
}

export const outboxCount = async (ctx) =>
	(await ctx.database.queryRaw("SELECT count(*) AS c FROM outbox"))[0].c;
