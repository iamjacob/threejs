import { createFileRoute } from "@tanstack/react-router";

/**
 * The existing scanner, over the shelves. The `_shelves` layout opens it while this route is
 * matched, so /scan deep-links, survives reload, and browser Back closes it without remounting
 * the 3D scene.
 */
export const Route = createFileRoute("/_shelves/scan")({
	component: () => null,
});
