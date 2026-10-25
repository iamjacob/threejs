import { redirect } from "@tanstack/react-router";
import { onboardingSeen } from "./storage";

/**
 * Integration points when this folder is copied onto another Boooks tree:
 *
 * 1. Home route `beforeLoad` calls `gateHomeRoute()` (src/routes/index.tsx).
 *    `?library=1` skips the redirect. `?onboarding=1` on the home URL replays it.
 * 2. File route `src/routes/onboarding.tsx`. Regenerate the TanStack route tree.
 * 3. The asset worker must serve the app shell for extensionless paths such as
 *    `/onboarding` (src/worker.ts). Vite's dev server already does this.
 * 4. Home skips its own canvas while `stageOwnsLibrary()` is true
 *    (src/routes/index.tsx). The flight reuses one WebGL context.
 * 5. `TourCamera` takes an optional `skipEntrance` so the scroll into the
 *    library does not replay the shelf dolly (src/components/tour/TourCamera.tsx).
 *
 * The library shelves, InstancedBooks, and src/game stay untouched.
 */
export function gateHomeRoute() {
	if (typeof window === "undefined") return;
	const params = new URLSearchParams(window.location.search);
	if (params.has("library")) return;
	if (params.has("onboarding") || !onboardingSeen()) {
		throw redirect({ to: "/onboarding" });
	}
}
