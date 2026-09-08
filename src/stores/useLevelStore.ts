import { create } from "zustand";
import { progressionConfig } from "../components/shelves/progressionConfig";

type LevelStore = {
  levelIndex: number;
  increaseLevel: () => void;
  decreaseLevel: () => void;
};

const lastLevelIndex = progressionConfig.levels.length - 1;

export const useLevelStore = create<LevelStore>((set) => ({
  levelIndex: 0,
  increaseLevel: () =>
    set((state) => ({
      levelIndex: Math.min(state.levelIndex + 1, lastLevelIndex),
    })),
  decreaseLevel: () =>
    set((state) => ({
      levelIndex: Math.max(state.levelIndex - 1, 0),
    })),
}));