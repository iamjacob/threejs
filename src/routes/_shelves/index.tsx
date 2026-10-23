import { createFileRoute } from "@tanstack/react-router";

/** Library (shelves). The scene itself is the `_shelves` layout, shared with /scan. */
export const Route = createFileRoute("/_shelves/")({ component: () => null });
