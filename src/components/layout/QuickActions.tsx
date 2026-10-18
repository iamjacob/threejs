import { Gauge, Maximize2, Minimize2, Mountain, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import {
	PERFORMANCE_MODE_KEY,
	performanceModeEnabled,
} from "../../lib/renderQuality";
import {
	type EnvironmentMode,
	usePresentationStore,
} from "../../stores/usePresentationStore";

const SCENES: EnvironmentMode[] = ["library", "castle", "forest", "zen"];

export function useFullscreen() {
	const [active, setActive] = useState(
		() =>
			typeof document !== "undefined" && Boolean(document.fullscreenElement),
	);
	useEffect(() => {
		const update = () => setActive(Boolean(document.fullscreenElement));
		document.addEventListener("fullscreenchange", update);
		return () => document.removeEventListener("fullscreenchange", update);
	}, []);
	const toggle = async () => {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await document.documentElement.requestFullscreen();
		} catch {
			/* iOS Safari has no document fullscreen; the button simply does nothing. */
		}
	};
	const supported =
		typeof document !== "undefined" && Boolean(document.fullscreenEnabled);
	return { active, toggle, supported };
}

/**
 * One-tap controls at the top of the menu: fullscreen, replay the light show,
 * cycle the backdrop scene, and a performance mode for weaker devices.
 */
export default function QuickActions({
	labels,
}: {
	labels: {
		fullscreen: string;
		exitFullscreen: string;
		lightShow: string;
		scene: string;
		performance: string;
		reloadHint: string;
	};
}) {
	const fullscreen = useFullscreen();
	const environment = usePresentationStore((state) => state.environment);
	const setEnvironment = usePresentationStore((state) => state.setEnvironment);
	const replayLightShow = usePresentationStore(
		(state) => state.replayLightShow,
	);
	const [performance, setPerformance] = useState(performanceModeEnabled);
	const [needsReload, setNeedsReload] = useState(false);
	const togglePerformance = () => {
		const next = !performance;
		try {
			localStorage.setItem(PERFORMANCE_MODE_KEY, String(next));
		} catch {
			/* Unavailable storage: the choice cannot persist. */
		}
		setPerformance(next);
		setNeedsReload(true);
	};
	const nextScene = () =>
		setEnvironment(SCENES[(SCENES.indexOf(environment) + 1) % SCENES.length]);
	return (
		<div className="nav-quick" data-testid="nav-quick-actions">
			<div className="nav-quick-row">
				{fullscreen.supported && (
					<button
						type="button"
						className="nav-quick-button"
						aria-pressed={fullscreen.active}
						aria-label={
							fullscreen.active ? labels.exitFullscreen : labels.fullscreen
						}
						title={
							fullscreen.active ? labels.exitFullscreen : labels.fullscreen
						}
						onClick={() => void fullscreen.toggle()}
					>
						{fullscreen.active ? (
							<Minimize2 size={20} />
						) : (
							<Maximize2 size={20} />
						)}
					</button>
				)}
				<button
					type="button"
					className="nav-quick-button"
					aria-label={labels.lightShow}
					title={labels.lightShow}
					onClick={replayLightShow}
				>
					<Sparkles size={20} />
				</button>
				<button
					type="button"
					className="nav-quick-button"
					aria-label={`${labels.scene}: ${environment}`}
					title={`${labels.scene}: ${environment}`}
					onClick={nextScene}
				>
					<Mountain size={20} />
					<span className="nav-quick-caption">{environment}</span>
				</button>
				<button
					type="button"
					className="nav-quick-button"
					role="switch"
					aria-checked={performance}
					aria-label={labels.performance}
					title={labels.performance}
					onClick={togglePerformance}
				>
					<Gauge size={20} />
				</button>
			</div>
			{needsReload && (
				<button
					type="button"
					className="nav-quick-reload"
					onClick={() => window.location.reload()}
				>
					{labels.reloadHint}
				</button>
			)}
		</div>
	);
}
