import { useEffect, useState } from "react";
import { bootstrapData } from "../../data/bootstrap";
import { importLegacyScans } from "../../data/usecases/legacyScanImport";
import { listLibraryBooks } from "../../data/usecases/libraryBooks";
import { getActiveProfileId } from "../../data/usecases/profiles";
import { createLegacyScanSource } from "../../platform/legacyScanSource";
import { useMapPlayStore } from "../../stores/useMapPlayStore";
import {
	type TornadoInstance,
	tornadoInstances,
} from "../core/tornadoBooks.ts";
import { toTornadoSource } from "./coverResolver";
import { registerProbe } from "./testProbe";
import { buildCoverSheet, type CoverSheet } from "./tornadoCovers";

export type TornadoLibrary = {
	profileId?: string;
	books: TornadoInstance[];
	sheet?: CoverSheet;
};

const EMPTY: TornadoLibrary = { books: [] };

/**
 * Loads the ACTIVE profile's library for the tornado, outside the frame loop:
 * bootstrap → (guest only) idempotent legacy scan import → listLibraryBooks → pure mapping →
 * one cover sheet. Reloads when the active profile changes (checked on mount, on window focus and
 * on visibility return — profile switching happens on another route), and a request token drops
 * stale results, so a previous profile's books are cleared immediately and never shown again.
 */
export function useTornadoLibrary(): TornadoLibrary {
	const [library, setLibrary] = useState<TornadoLibrary>(EMPTY);

	useEffect(() => {
		let token = 0;
		let shownProfile: string | undefined;
		let disposed = false;
		const ui = useMapPlayStore.getState;
		/** Test diagnostics only (no-op unless VITE_BOOOKS_TEST_HOOKS=1): what the tornado shows now. */
		const publish = (profileId: string, ids: string[], sources: string[]) =>
			registerProbe({ library: { profileId, ids, sources } });

		const load = async (reason: string) => {
			const mine = ++token;
			const boot = await bootstrapData();
			if (disposed || mine !== token) return;
			if (boot.status !== "ready") {
				ui().setLibrary({ state: "unavailable", count: 0, hidden: 0 });
				return;
			}
			const { ctx } = boot;
			const profileId = (await getActiveProfileId(ctx)) ?? boot.profile.id;
			if (disposed || mine !== token) return;
			if (profileId !== shownProfile) {
				// Profile changed (or first load): clear immediately; never show stale books.
				shownProfile = profileId;
				setLibrary({ profileId, books: [] });
				publish(profileId, [], []);
				ui().setLibrary({ state: "loading", count: 0, hidden: 0 });
			}
			// Guest-only, idempotent; a no-op for accounts and for already-imported scans.
			const source =
				reason === "initial" ? createLegacyScanSource() : undefined;
			if (source) {
				try {
					const report = await importLegacyScans(ctx, profileId, source);
					if (report.failed.length)
						console.warn(
							"Legacy scan import: some scans were not imported",
							report.failed,
						);
					ui().setImport(
						report.status,
						report.imported.length,
						report.failed.length,
					);
				} catch (error) {
					console.warn(
						"Legacy scan import failed; originals are untouched",
						error,
					);
					ui().setImport("error", 0, 0);
				}
			}
			const rows = await listLibraryBooks(ctx, profileId);
			if (disposed || mine !== token) return;
			const { instances, hidden } = tornadoInstances(rows.map(toTornadoSource));
			setLibrary({ profileId, books: instances });
			ui().setLibrary({ state: "ready", count: instances.length, hidden });
			if (!instances.length) {
				publish(profileId, [], []);
				return;
			}
			const sheet = await buildCoverSheet(
				instances,
				ctx.files,
				() => disposed || mine !== token,
			);
			if (disposed || mine !== token || !sheet) return;
			setLibrary({ profileId, books: instances, sheet });
			publish(
				profileId,
				instances.map((i) => i.bookId),
				sheet.sources,
			);
		};

		const refresh = () => {
			if (document.visibilityState === "visible")
				void load("focus").catch(() => {});
		};
		void load("initial").catch((error) =>
			ui().setLibrary({
				state: "unavailable",
				count: 0,
				hidden: 0,
				error: String(error),
			}),
		);
		window.addEventListener("focus", refresh);
		document.addEventListener("visibilitychange", refresh);
		return () => {
			disposed = true;
			window.removeEventListener("focus", refresh);
			document.removeEventListener("visibilitychange", refresh);
		};
	}, []);

	return library;
}
