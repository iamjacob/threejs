import { createFileRoute } from "@tanstack/react-router";

/**
 * Reader over the shelves (`/read/:bookId`). The `_shelves` layout opens the existing in-scene
 * reader (zoom into the book, then the Foliate dialog) for this id. On a direct link or refresh it
 * opens straight into the reader rather than replaying the decorative zoom.
 */
export const Route = createFileRoute("/_shelves/read/$bookId")({
	component: () => null,
});
