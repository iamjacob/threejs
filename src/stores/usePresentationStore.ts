import { create } from "zustand";

export type CameraMode = "shelf" | "focus" | "book";
export type EnvironmentMode = "library" | "castle" | "forest" | "zen";

type PresentationState = {
	movingLight: boolean;
	blurEnabled: boolean;
	cameraMode: CameraMode;
	environment: EnvironmentMode;
	lightShowDuration: number;
	lightShowCycles: number;
	lightPulse: number;
	lightFlareSize: number;
	fireIntensity: number;
	fireReflection: number;
	fireReach: number;
	lightShowKey: number;
	toggleLighting: () => void;
	toggleBlur: () => void;
	setCameraMode: (mode: CameraMode) => void;
	setEnvironment: (environment: EnvironmentMode) => void;
	setLightShowDuration: (duration: number) => void;
	setLightShowCycles: (cycles: number) => void;
	setLightPulse: (pulse: number) => void;
	setLightFlareSize: (size: number) => void;
	setFireIntensity: (intensity: number) => void;
	setFireReflection: (reflection: number) => void;
	setFireReach: (reach: number) => void;
	replayLightShow: () => void;
};

export const usePresentationStore = create<PresentationState>((set) => ({
	movingLight: false,
	blurEnabled: true,
	cameraMode: "shelf",
	environment: "library",
	lightShowDuration: 1.4,
	lightShowCycles: 3.5,
	lightPulse: 1,
	lightFlareSize: 1,
	fireIntensity: 2,
	fireReflection: 2.5,
	fireReach: 16,
	lightShowKey: 0,
	toggleLighting: () => set((state) => ({ movingLight: !state.movingLight })),
	toggleBlur: () => set((state) => ({ blurEnabled: !state.blurEnabled })),
	setCameraMode: (cameraMode) => set({ cameraMode }),
	setEnvironment: (environment) => set({ environment }),
	setLightShowDuration: (lightShowDuration) => set({ lightShowDuration }),
	setLightShowCycles: (lightShowCycles) => set({ lightShowCycles }),
	setLightPulse: (lightPulse) => set({ lightPulse }),
	setLightFlareSize: (lightFlareSize) => set({ lightFlareSize }),
	setFireIntensity: (fireIntensity) => set({ fireIntensity }),
	setFireReflection: (fireReflection) => set({ fireReflection }),
	setFireReach: (fireReach) => set({ fireReach }),
	replayLightShow: () => set((state) => ({ lightShowKey: state.lightShowKey + 1 })),
}));
