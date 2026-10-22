import { useEffect, useState } from "react";
import { bootstrapData } from "../../data/bootstrap";
import type { DataContext } from "../../data/usecases/context";
import { useMapPlayStore } from "../../stores/useMapPlayStore";
import {
	loadMapCheckpoint,
	type MapCheckpoint,
	saveMapCheckpoint,
} from "../checkpoint";
import { DEFAULT_GAME_CONFIG, HOME } from "../core/config.ts";
import type { LngLat } from "../core/geo.ts";
import { MapPlayRuntime } from "../runtime/mapRuntime.ts";

/**
 * Owns one MapPlayRuntime per mount: start → restore checkpoint → ready; on unmount dispose (which
 * writes the exit checkpoint). React StrictMode mounts effects twice in dev; the first runtime is
 * fully disposed before the second starts, and the ready() of a cancelled mount is skipped.
 *
 * Checkpoint writes are serialized and deduplicated (saveMapCheckpoint skips < 1 m changes).
 */
export function useMapPlayRuntime() {
	const [runtime, setRuntime] = useState<MapPlayRuntime>();

	useEffect(() => {
		const ui = useMapPlayStore.getState;
		ui().reset();
		let cancelled = false;
		let ctx: DataContext | undefined;
		let profileId: string | undefined;
		let last: MapCheckpoint | undefined;
		let saving = Promise.resolve();

		const save = (position: LngLat) => {
			if (!ctx || !profileId) return;
			const c = ctx;
			const p = profileId;
			saving = saving
				.then(async () => {
					const { checkpoint } = await saveMapCheckpoint(c, p, position, last);
					last = checkpoint;
					ui().setCheckpoint("saved");
				})
				.catch(() => ui().setCheckpoint("unsaved"));
		};

		const rt = new MapPlayRuntime({ home: HOME, onCheckpoint: save });
		const offEvents = rt.loop.subscribe((e) => ui().applyEvent(e));
		rt.start();
		setRuntime(rt);

		(async () => {
			const boot = await bootstrapData();
			if (cancelled) return;
			let restore: LngLat | undefined;
			if (boot.status === "ready") {
				ctx = boot.ctx;
				profileId = boot.profile.id;
				last = await loadMapCheckpoint(ctx, profileId, {
					home: HOME,
					maxDistance: DEFAULT_GAME_CONFIG.maxDistance,
				}).catch(() => undefined);
				if (cancelled) return;
				restore = last;
				ui().setCheckpoint(last ? "restored" : "none");
			} else {
				// Still playable without storage (e.g. another tab holds the DB); not saved.
				ui().setCheckpoint("unsaved");
			}
			rt.ready(restore);
			ui().setStatus("ready");
		})().catch((error) => {
			if (!cancelled) ui().setStatus("error", String(error));
		});

		return () => {
			cancelled = true;
			offEvents();
			rt.dispose();
			setRuntime(undefined);
		};
	}, []);

	return runtime;
}
