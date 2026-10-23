import { createFileRoute } from "@tanstack/react-router";

/**
 * Book details over the shelves (`/book/:bookId`). The `_shelves` layout opens the existing
 * BookInfoCard for this id (or shows the not-found card), so the 3D scene stays mounted while the
 * URL changes. Ids are public catalog ids or books scanned on this device.
 */
export const Route = createFileRoute("/_shelves/book/$bookId")({
	component: () => null,
});
