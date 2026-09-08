import { create } from "zustand";

type PresentationState = {
	redAccent: boolean;
	blurEnabled: boolean;
	toggleLighting: () => void;
	toggleBlur: () => void;
};

export const usePresentationStore = create<PresentationState>((set) => ({
	redAccent: false,
	blurEnabled: true,
	toggleLighting: () => set((state) => ({ redAccent: !state.redAccent })),
	toggleBlur: () => set((state) => ({ blurEnabled: !state.blurEnabled })),
}));
