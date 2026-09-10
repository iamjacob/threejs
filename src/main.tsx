import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { Cache } from "three";
import { routeTree } from "./routeTree.gen";

// Share decoded image data between shelf, open-book and particle texture loaders.
Cache.enabled = true;

const router = createRouter({
	routeTree,
	basepath: import.meta.env.BASE_URL,
	defaultPreload: "intent",
	scrollRestoration: true,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("app")!;

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(<RouterProvider router={router} />);
}
