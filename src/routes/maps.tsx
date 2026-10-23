import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import LoaderMark from "../components/layout/LoaderMark";

// MapLibre + the map scene load only on this route, keeping the library's first bundle unchanged.
const MapPlay = lazy(() => import("../game/map/MapPlay"));

export const Route = createFileRoute("/maps")({ component: MapsPage });

function MapsPage() {
	return (
		<Suspense
			fallback={
				<main
					className="fixed inset-0 grid place-items-center"
					aria-label="Loading map"
					style={{
						background:
							"radial-gradient(circle at 50% 48%, #0e172c 0%, #070b17 58%, #03050b 100%)",
					}}
				>
					<LoaderMark />
				</main>
			}
		>
			<MapPlay />
		</Suspense>
	);
}
