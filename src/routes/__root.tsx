import { createRootRoute, Outlet } from "@tanstack/react-router";
import { lazy, Suspense, useSyncExternalStore } from "react";
import { useFeatureFlags } from "../lib/featureFlags";

import "../styles.css";

export const Route = createRootRoute({
	component: RootComponent,
});

const desktopQuery = "(min-width: 768px)";

function subscribeToViewport(onChange: () => void) {
	const media = window.matchMedia(desktopQuery);
	media.addEventListener("change", onChange);
	return () => media.removeEventListener("change", onChange);
}

// Dead-code eliminated in production, so the devtools packages leave the bundle.
const LazyRootDevtools = import.meta.env.DEV
	? lazy(() => import("../components/layout/RootDevtools"))
	: null;

function RootComponent() {
	const { SHOW_DEMO_UI } = useFeatureFlags();
	// The floating devtools trigger otherwise covers the mobile Next button.
	const isDesktop = useSyncExternalStore(
		subscribeToViewport,
		() => window.matchMedia(desktopQuery).matches,
		() => true,
	);
	return (
		<>
			<Outlet />
			{LazyRootDevtools && SHOW_DEMO_UI && isDesktop ? (
				<Suspense fallback={null}>
					<LazyRootDevtools />
				</Suspense>
			) : null}
		</>
	);
}
