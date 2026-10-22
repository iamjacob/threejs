import type { ControllerActionItem } from "../../components/layout/BoooksController";
import { useMapPlayStore } from "../../stores/useMapPlayStore";

/** Controller actions on this route. `play` reuses the controller's existing toggle UI. */
export const MAP_PLAY_ACTIONS: ControllerActionItem[] = [
	{
		id: "play",
		label: "Pause",
		activeLabel: "Resume",
		toggle: true,
		icon: (
			<>
				<rect x="6" y="5" width="4" height="14" rx="1" />
				<rect x="14" y="5" width="4" height="14" rx="1" />
			</>
		),
		activeIcon: <path d="M7 5v14l12-7z" />,
	},
	{
		id: "follow",
		label: "Follow tornado",
		icon: (
			<>
				<circle cx="12" cy="12" r="3" />
				<path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
			</>
		),
	},
];

/** Low-frequency status line. Re-renders only on GameEvents, never per frame. */
export function MapPlayHud() {
	const {
		status,
		paused,
		moving,
		following,
		atBoundary,
		mapMode,
		checkpoint,
		error,
	} = useMapPlayStore();
	const label =
		status === "loading"
			? "Loading your spot…"
			: status === "error"
				? `Could not start: ${error}`
				: paused
					? "Paused"
					: atBoundary
						? "Edge of the play area"
						: moving
							? "Moving"
							: "Drag the B to steer";
	return (
		<div className="pointer-events-none absolute left-4 top-4 z-10 grid gap-1 rounded-2xl bg-[rgba(12,13,14,.79)] px-4 py-2 text-xs text-white">
			<output data-testid="map-play-status" aria-live="polite">
				{label}
			</output>
			<span className="text-[10px] text-slate-300" data-testid="map-play-meta">
				{mapMode === "offline" ? "Offline map" : "Map"} ·{" "}
				{following ? "Following" : "Free camera"} · checkpoint {checkpoint}
			</span>
		</div>
	);
}
