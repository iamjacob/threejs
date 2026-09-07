import { create } from "zustand";
import type {
  BookData,
  ParticlePhase,
} from "../src/components/particles/types";

interface ParticleState {
  formingBookData: BookData | null;
  phase: ParticlePhase;
  particleProgress: number;
  bookScale: number;
  requestBook: (bookData: BookData) => void;
  setParticleProgress: (progress: number) => void;
  setBookScale: (scale: number) => void;
  completeFormation: () => void;
  completeShrink: () => void;
}

export const useParticleStore = create<ParticleState>((set) => ({
  formingBookData: null,
  phase: "idle",
  particleProgress: 0,
  bookScale: 1,

  requestBook: (bookData) =>
    set((state) => {
      if (state.phase === "idle") {
        return {
          formingBookData: bookData,
          phase: "forming",
          particleProgress: 0,
          bookScale: 1,
        };
      }

      if (state.phase === "visible") {
        return {
          formingBookData: bookData,
          phase: "shrinking",
          bookScale: 1,
        };
      }

      return state;
    }),

  setParticleProgress: (particleProgress) => set({ particleProgress }),
  setBookScale: (bookScale) => set({ bookScale }),

  completeFormation: () =>
    set({
      phase: "visible",
      particleProgress: 1,
      bookScale: 1,
    }),

  completeShrink: () =>
    set({
      phase: "forming",
      particleProgress: 0,
      bookScale: 1,
    }),
}));
