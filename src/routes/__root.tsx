import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useSyncExternalStore } from "react";
import SceneTransition from "../components/layout/SceneTransition";
import { NotFound, RouteError } from "../components/shell/RouteFallbacks";
import { useFeatureFlags } from "../lib/featureFlags";

import "../styles.css";

// Disposable multi-database spike: test-hooks builds only (tree-shaken from normal builds).
if (import.meta.env.VITE_BOOOKS_TEST_HOOKS === "1")
	void import("../data/spike/multiDbSpike").then((m) =>
		m.installMultiDbSpike(),
	);

export const Route = createRootRoute({
	component: RootComponent,
	notFoundComponent: NotFound,
	errorComponent: RouteError,
});

const desktopQuery = "(min-width: 768px)";

function subscribeToViewport(onChange: () => void) {
	const media = window.matchMedia(desktopQuery);
	media.addEventListener("change", onChange);
	return () => media.removeEventListener("change", onChange);
}

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
			<SceneTransition />
			{SHOW_DEMO_UI && isDesktop && (
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "TanStack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
			)}
		</>
	);
}
