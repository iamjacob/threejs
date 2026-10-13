import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useSyncExternalStore } from "react";
import { SHOW_DEMO_UI } from "../lib/featureFlags";

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

function RootComponent() {
	// The floating devtools trigger otherwise covers the mobile Next button.
	const isDesktop = useSyncExternalStore(
		subscribeToViewport,
		() => window.matchMedia(desktopQuery).matches,
		() => true,
	);
	return (
		<>
			<Outlet />
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
