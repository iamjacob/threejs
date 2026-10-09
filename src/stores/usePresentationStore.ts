import { create } from "zustand";

export type CameraMode = "shelf" | "focus" | "book";
export type EnvironmentMode = "library" | "castle" | "forest" | "zen";

type PresentationState = {
	movingLight: boolean;
	blurEnabled: boolean;
	cameraMode: CameraMode;
	environment: EnvironmentMode;
	toggleLighting: () => void;
	toggleBlur: () => void;
	setCameraMode: (mode: CameraMode) => void;
	setEnvironment: (environment: EnvironmentMode) => void;
};

export const usePresentationStore = create<PresentationState>((set) => ({
	movingLight: false,
	blurEnabled: true,
	cameraMode: "shelf",
	environment: "library",
	toggleLighting: () => set((state) => ({ movingLight: !state.movingLight })),
	toggleBlur: () => set((state) => ({ blurEnabled: !state.blurEnabled })),
	setCameraMode: (cameraMode) => set({ cameraMode }),
	setEnvironment: (environment) => set({ environment }),
}));
