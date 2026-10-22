import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// MapLibre + the map scene load only on this route, keeping the library's first bundle unchanged.
const MapPlay = lazy(() => import("../game/map/MapPlay"));

export const Route = createFileRoute("/play")({ component: PlayPage });

function PlayPage() {
	return (
		<Suspense
			fallback={
				<main className="fixed inset-0 grid place-items-center bg-[#06192e] text-sm text-slate-200">
					Loading map…
				</main>
			}
		>
			<MapPlay />
		</Suspense>
	);
}
