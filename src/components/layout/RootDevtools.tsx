import { TanStackDevtools } from "@tanstack/react-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

/** Loaded only in development. Production builds never import this module. */
export default function RootDevtools() {
	return (
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
	);
}
