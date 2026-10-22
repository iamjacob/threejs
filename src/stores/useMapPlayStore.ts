import { create } from "zustand";
import type { GameEvent } from "../game/core/types.ts";

/**
 * Low-frequency UI/session state for the map play route. Fed by GameEvents (a handful per
 * session), never by the per-frame simulation. Holds no game rules and no positions.
 */
type MapPlayState = {
	status: "loading" | "ready" | "error";
	error?: string;
	paused: boolean;
	moving: boolean;
	following: boolean;
	atBoundary: boolean;
	mapMode: "online" | "offline";
	checkpoint: "none" | "restored" | "saved" | "unsaved";
	/** Library shown in the tornado (counts only; book rows never live in Zustand). */
	library: {
		state: "loading" | "ready" | "unavailable";
		count: number;
		hidden: number;
		error?: string;
	};
	legacyImport?: { status: string; imported: number; failed: number };
	setLibrary: (library: MapPlayState["library"]) => void;
	setImport: (status: string, imported: number, failed: number) => void;
	setStatus: (status: MapPlayState["status"], error?: string) => void;
	setMapMode: (mode: MapPlayState["mapMode"]) => void;
	setFollowing: (following: boolean) => void;
	setCheckpoint: (state: MapPlayState["checkpoint"]) => void;
	applyEvent: (event: GameEvent) => void;
	reset: () => void;
};

const initial = {
	status: "loading" as const,
	error: undefined,
	paused: false,
	moving: false,
	following: true,
	atBoundary: false,
	mapMode: "online" as const,
	checkpoint: "none" as const,
	library: { state: "loading" as const, count: 0, hidden: 0 },
	legacyImport: undefined,
};

export const useMapPlayStore = create<MapPlayState>()((set) => ({
	...initial,
	setStatus: (status, error) => set({ status, error }),
	setMapMode: (mapMode) => set({ mapMode }),
	setFollowing: (following) => set({ following }),
	setCheckpoint: (checkpoint) => set({ checkpoint }),
	setLibrary: (library) => set({ library }),
	setImport: (status, imported, failed) =>
		set({ legacyImport: { status, imported, failed } }),
	applyEvent: (event) => {
		switch (event.type) {
			case "moving-started":
				return set({ moving: true, atBoundary: false });
			case "moving-stopped":
				return set({ moving: false });
			case "paused":
				// Only an explicit user pause shows the paused UI; background/loading are silent.
				if (event.reason !== "user") return set({ moving: false });
				return set({ paused: true, moving: false });
			case "resumed":
				return set({ paused: false });
			case "boundary-reached":
				return set({ atBoundary: true });
		}
	},
	reset: () => set(initial),
}));
