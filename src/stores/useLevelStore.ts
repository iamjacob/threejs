import { create } from "zustand";
import { BOOKS_SHELF_LEVEL } from "../components/shelves/shelfBooks";
import { progressionConfig } from "../components/shelves/progressionConfig";

type LevelStore = {
	levelIndex: number;
	libraryLevel: number;
	setLibraryLevel: (level: number) => void;
	isPlaying: boolean;
	startDemo: (levelIndex?: number, isPlaying?: boolean) => void;
	togglePlayback: () => void;
	pausePlayback: () => void;
	advanceLevel: () => void;
	increaseLevel: () => void;
	decreaseLevel: () => void;
};

const lastLevelIndex = progressionConfig.levels.length - 1;

function savedLibraryLevel() {
	try {
		const saved = localStorage.getItem("boooks-shelf-level");
		const level = saved === null ? BOOKS_SHELF_LEVEL : Number(saved);
		return Number.isFinite(level)
			? Math.max(BOOKS_SHELF_LEVEL, Math.min(Math.trunc(level), lastLevelIndex))
			: BOOKS_SHELF_LEVEL;
	} catch {
		return BOOKS_SHELF_LEVEL;
	}
}

export const useLevelStore = create<LevelStore>((set) => ({
	levelIndex: 1,
	libraryLevel: savedLibraryLevel(),
	setLibraryLevel: (value) => {
		if (!Number.isFinite(value)) return;
		const libraryLevel = Math.max(
			BOOKS_SHELF_LEVEL,
			Math.min(Math.trunc(value), lastLevelIndex),
		);
		set({ libraryLevel });
		try {
			localStorage.setItem("boooks-shelf-level", String(libraryLevel));
		} catch {
			/* Retain this session's choice. */
		}
	},
	isPlaying: true,
	startDemo: (levelIndex = 1, isPlaying = true) =>
		set({
			levelIndex: Math.max(0, Math.min(levelIndex, lastLevelIndex)),
			isPlaying,
		}),
	togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),
	pausePlayback: () => set({ isPlaying: false }),
	advanceLevel: () =>
		set((state) => ({
			levelIndex:
				state.levelIndex === lastLevelIndex ? 1 : state.levelIndex + 1,
		})),
	increaseLevel: () =>
		set((state) => ({
			levelIndex: Math.min(state.levelIndex + 1, lastLevelIndex),
			isPlaying: false,
		})),
	decreaseLevel: () =>
		set((state) => ({
			levelIndex: Math.max(state.levelIndex - 1, 0),
			isPlaying: false,
		})),
}));
