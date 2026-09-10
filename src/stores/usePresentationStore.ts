import { create } from "zustand";

type PresentationState = {
	movingLight: boolean;
	blurEnabled: boolean;
	toggleLighting: () => void;
	toggleBlur: () => void;
};

export const usePresentationStore = create<PresentationState>((set) => ({
	movingLight: false,
	blurEnabled: true,
	toggleLighting: () => set((state) => ({ movingLight: !state.movingLight })),
	toggleBlur: () => set((state) => ({ blurEnabled: !state.blurEnabled })),
}));
