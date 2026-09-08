// core/progression/progressionConfig.ts
// import type { UnlockFlags } from './types'

export type LevelConfig = {
  minBooks: number
  shelves: number[]
  // unlocks?: UnlockFlags
}

export const progressionConfig: { levels: LevelConfig[] } = {
  levels: [
    { minBooks: 0, shelves: [0, 0, 0, 0] },
    { minBooks: 1, shelves: [0, 0.08, 0, 0] },
    { minBooks: 6, shelves: [0, 0.08, 0.08, 0] },
    { minBooks: 11, shelves: [0.08, 0.08, 0.08, 0] },
    { minBooks: 16, shelves: [0.08, 0.08, 0.08, 0.08] },
    { minBooks: 21, shelves: [0.11, 0.11, 0.11, 0.11] },
    { minBooks: 26, shelves: [0.14, 0.14, 0.14, 0.14] },
    { minBooks: 52, shelves: [0.21, 0.21, 0.21, 0.21] },
    { minBooks: 100, shelves: [0.42, 0.42, 0.42, 0.42]},
    { minBooks: 120, shelves: [0.5, 0.5, 0.5, 0.5]},
    { minBooks: 200, shelves: [1, 1, 1, 1]},
  ],
}
