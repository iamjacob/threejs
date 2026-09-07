import { create } from "zustand";

interface DissolveState {
	dissolveProgress: number;
	targetProgress: number;
	isDissolving: boolean;
	startDissolve: () => void;
	resetDissolve: () => void;
	setDissolveProgress: (progress: number) => void;
}

export const useDissolveStore = create<DissolveState>((set) => ({
	dissolveProgress: 0,
	targetProgress: 0,
	isDissolving: false,

	startDissolve: () =>
		set({
			targetProgress: 1,
			isDissolving: true,
		}),

	resetDissolve: () =>
		set({
			targetProgress: 0,
			isDissolving: false,
		}),

	setDissolveProgress: (dissolveProgress) => set({ dissolveProgress }),
}));
