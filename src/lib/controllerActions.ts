import { useShelfControlsStore } from "../../stores/useShelfControlsStore";
import { BOOKS_SHELF_LEVEL } from "../components/shelves/shelfBooks";
import { setControllerJoystickMode } from "../components/tour/controllerJoystick";
import { sceneTransition } from "../stores/sceneTransition";
import { useBookStore } from "../stores/useBookStore";
import { useLevelStore } from "../stores/useLevelStore";
import { usePresentationStore } from "../stores/usePresentationStore";
import { useTourStore } from "../stores/useTourStore";

const SCENES = ["library", "castle", "forest", "zen"] as const;

export type ControllerUiHandlers = {
	openScanner: () => void;
	openMessages: () => void;
	openTimer: () => void;
	flashShutter: () => void;
	notify: (message: string) => void;
};

function togglePlay(on: boolean | undefined, ui: ControllerUiHandlers) {
	const presentation = usePresentationStore.getState();
	let playing: boolean;
	if (typeof on === "boolean") {
		presentation.setCinematicPlaying(on);
		playing = on;
	} else {
		playing = presentation.toggleCinematicPlaying();
	}
	const tour = useTourStore.getState();
	if (playing && tour.bookPanel !== "closed") tour.dismissPreview();
	useTourStore.setState({ paused: !playing });
	ui.notify(
		playing ? "Playing Hollywood · Zen shelf reel" : "Paused shelf reel",
	);
}

function jumpToRandomBook() {
	const { books, selectedBookId } = useBookStore.getState();
	const candidates = books.filter((item) => item.id !== selectedBookId);
	const target =
		candidates[Math.floor(Math.random() * candidates.length)] ?? books[0];
	if (target) useTourStore.getState().previewBook(target.id);
}

/** Runs one radial-controller action. `on` is the new state for toggles. */
export function runControllerAction(
	id: string,
	on: boolean | undefined,
	ui: ControllerUiHandlers,
) {
	const tour = useTourStore.getState();
	const presentation = usePresentationStore.getState();
	switch (id) {
		case "scan":
			ui.openScanner();
			break;
		case "play":
			togglePlay(on, ui);
			break;
		case "screenshot":
			ui.flashShutter();
			presentation.requestScreenshot();
			break;
		case "chat":
			ui.openMessages();
			break;
		case "timer":
			ui.openTimer();
			break;
		case "zoom":
			setControllerJoystickMode(on ? "zoom" : "look");
			break;
		case "jump":
			jumpToRandomBook();
			break;
		case "cam":
			useLevelStore.getState().setLibraryLevel(on ? 10 : BOOKS_SHELF_LEVEL);
			break;
		case "lamp":
			if (on) presentation.replayLightShow();
			presentation.toggleLighting();
			break;
		case "home":
			presentation.setCinematicPlaying(false);
			useTourStore.setState((state) => ({
				paused: true,
				focusRevision: state.focusRevision + 1,
			}));
			break;
		case "shelf": {
			if (tour.bookPanel !== "closed") {
				tour.dismissPreview();
				break;
			}
			const shelf = useShelfControlsStore.getState();
			shelf.setEditing(!shelf.editing);
			break;
		}
		case "quote":
			if (tour.bookPanel === "closed")
				tour.previewBook(useBookStore.getState().selectedBookId);
			else tour.openReader();
			break;
		case "go-map":
			// Stop the reel so nothing keeps animating under the transition overlay.
			presentation.setCinematicPlaying(false);
			useTourStore.setState({ paused: true });
			sceneTransition.go("/play");
			break;
		case "map": {
			const next =
				SCENES[(SCENES.indexOf(presentation.environment) + 1) % SCENES.length];
			presentation.setEnvironment(next);
			break;
		}
	}
}
