import { useSyncExternalStore } from "react";

export function usePrefersReducedMotion() {
	return useSyncExternalStore(
		(onChange) => {
			const media = window.matchMedia("(prefers-reduced-motion: reduce)");
			media.addEventListener("change", onChange);
			return () => media.removeEventListener("change", onChange);
		},
		() => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		() => false,
	);
}
