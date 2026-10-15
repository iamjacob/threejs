import { create } from "zustand";

export const featureDefaults = {
	SHOW_DEMO_UI: import.meta.env?.VITE_SHOW_DEMO_UI === "true",
	SHOW_HELIX_NAV: import.meta.env?.VITE_SHOW_HELIX_NAV === "true",
	SHOW_TOUR_TEXT: false,
};
export type FeatureFlag = keyof typeof featureDefaults;
const key = "boooks-feature-flags-v1";
function loadFlags() {
	const flags = { ...featureDefaults };
	try {
		const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
		for (const flag of Object.keys(flags) as FeatureFlag[]) {
			if (typeof saved?.[flag] === "boolean") flags[flag] = saved[flag];
		}
	} catch {
		/* Use environment defaults when storage is unavailable. */
	}
	return flags;
}
export const useFeatureFlags = create<
	typeof featureDefaults & {
		setFlag: (flag: FeatureFlag, enabled: boolean) => void;
		reset: () => void;
	}
>((set) => ({
	...loadFlags(),
	setFlag: (flag, enabled) => set({ [flag]: enabled }),
	reset: () => set(featureDefaults),
}));
useFeatureFlags.subscribe((state) => {
	try {
		localStorage.setItem(
			key,
			JSON.stringify(
				Object.fromEntries(
					(Object.keys(featureDefaults) as FeatureFlag[]).map((flag) => [
						flag,
						state[flag],
					]),
				),
			),
		);
	} catch {
		/* Changes still work for this visit. */
	}
});
