import { create } from "zustand";
import { progressionConfig } from "../components/shelves/progressionConfig";

type LevelStore = {
	levelIndex: number;
	isPlaying: boolean;
	startDemo: (levelIndex?: number, isPlaying?: boolean) => void;
	togglePlayback: () => void;
	pausePlayback: () => void;
	advanceLevel: () => void;
	increaseLevel: () => void;
	decreaseLevel: () => void;
};

const lastLevelIndex = progressionConfig.levels.length - 1;

export const useLevelStore = create<LevelStore>((set) => ({
	levelIndex: 1,
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
