import {
	Camera,
	Dices,
	Focus,
	Gauge,
	Maximize2,
	Minimize2,
	Mountain,
	Shuffle,
	Sparkles,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useShelfControlsStore } from "../../../stores/useShelfControlsStore";
import {
	PERFORMANCE_MODE_KEY,
	performanceModeEnabled,
} from "../../lib/renderQuality";
import { useBookStore } from "../../stores/useBookStore";
import {
	type EnvironmentMode,
	usePresentationStore,
} from "../../stores/usePresentationStore";
import { useTourStore } from "../../stores/useTourStore";

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

export type QuickActionLabels = {
	fullscreen: string;
	exitFullscreen: string;
	lightShow: string;
	scene: string;
	performance: string;
	reloadHint: string;
	shuffle: string;
	randomBook: string;
	recenter: string;
	scan: string;
};

function QuickButton({
	label,
	caption,
	icon,
	pressed,
	checked,
	onClick,
}: {
	label: string;
	caption?: string;
	icon: ReactNode;
	pressed?: boolean;
	checked?: boolean;
	onClick: () => void;
}) {
	const content = (
		<>
			{icon}
			<span className="nav-quick-caption">{caption ?? label}</span>
		</>
	);
	if (checked !== undefined)
		return (
			<button
				type="button"
				className="nav-quick-button"
				role="switch"
				aria-checked={checked}
				aria-label={label}
				title={label}
				onClick={onClick}
			>
				{content}
			</button>
		);
	return (
		<button
			type="button"
			className="nav-quick-button"
			aria-pressed={pressed}
			aria-label={label}
			title={label}
			onClick={onClick}
		>
			{content}
		</button>
	);
}

/** One-tap controls at the top of the menu, in a horizontally scrolling strip. */
export default function QuickActions({
	labels,
	onClose,
	onScan,
}: {
	labels: QuickActionLabels;
	onClose?: () => void;
	onScan?: () => void;
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
	const shuffle = () => {
		useShelfControlsStore.getState().shuffle(useBookStore.getState().books);
		onClose?.();
	};
	const randomBook = () => {
		const { books, selectedBookId } = useBookStore.getState();
		const others = books.filter((book) => book.id !== selectedBookId);
		const pick = others[Math.floor(Math.random() * others.length)] ?? books[0];
		if (!pick) return;
		onClose?.();
		useTourStore.getState().previewBook(pick.id);
	};
	const recenter = () => {
		useTourStore.setState((state) => ({
			paused: true,
			focusRevision: state.focusRevision + 1,
		}));
		onClose?.();
	};
	return (
		<div className="nav-quick" data-testid="nav-quick-actions">
			<div className="nav-quick-row">
				{fullscreen.supported && (
					<QuickButton
						label={
							fullscreen.active ? labels.exitFullscreen : labels.fullscreen
						}
						caption={labels.fullscreen}
						pressed={fullscreen.active}
						icon={
							fullscreen.active ? (
								<Minimize2 size={20} />
							) : (
								<Maximize2 size={20} />
							)
						}
						onClick={() => void fullscreen.toggle()}
					/>
				)}
				{onScan && (
					<QuickButton
						label={labels.scan}
						icon={<Camera size={20} />}
						onClick={onScan}
					/>
				)}
				<QuickButton
					label={labels.randomBook}
					icon={<Dices size={20} />}
					onClick={randomBook}
				/>
				<QuickButton
					label={labels.shuffle}
					icon={<Shuffle size={20} />}
					onClick={shuffle}
				/>
				<QuickButton
					label={labels.recenter}
					icon={<Focus size={20} />}
					onClick={recenter}
				/>
				<QuickButton
					label={`${labels.scene}: ${environment}`}
					caption={environment}
					icon={<Mountain size={20} />}
					onClick={nextScene}
				/>
				<QuickButton
					label={labels.lightShow}
					icon={<Sparkles size={20} />}
					onClick={replayLightShow}
				/>
				<QuickButton
					label={labels.performance}
					checked={performance}
					icon={<Gauge size={20} />}
					onClick={togglePerformance}
				/>
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
