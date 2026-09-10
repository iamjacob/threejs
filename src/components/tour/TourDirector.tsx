import { useProgress } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useParticleStore } from "../../../stores/useParticleStore";
import { useReadingStore } from "../../../stores/useReadingStore";
import { useLevelStore } from "../../stores/useLevelStore";
import { useTourStore } from "../../stores/useTourStore";
import { progressionConfig } from "../shelves/progressionConfig";
import { tourStages } from "./tourStages";

export default function TourDirector() {
	useFrame((_, delta) => {
		const tour = useTourStore.getState();
		if (
			!tour.ready ||
			tour.paused ||
			useProgress.getState().active ||
			document.hidden ||
			document.querySelector("dialog[open]")
		)
			return;
		const elapsed = tour.elapsed + Math.min(delta, 0.1);
		useTourStore.setState({ elapsed });
		if (tour.stage === "read") {
			const page = elapsed > 8 ? 4 : elapsed > 4 ? 2 : elapsed > 1.5 ? 1 : 0;
			if (
				(tour.elapsed <= 1.5 && elapsed > 1.5) ||
				(tour.elapsed <= 4 && elapsed > 4) ||
				(tour.elapsed <= 8 && elapsed > 8)
			)
				useReadingStore.getState().goToPage(page);
		}
		if (tour.stage === "grow") {
			const level = Math.min(
				progressionConfig.levels.length - 1,
				1 + Math.floor(elapsed / 1.6),
			);
			if (useLevelStore.getState().levelIndex !== level)
				useLevelStore.getState().startDemo(level, false);
		}
		if (
			tour.action === "running" &&
			tour.stage === "add" &&
			useParticleStore.getState().phase === "visible"
		)
			tour.finishAdd();
		const duration = tourStages[tour.stage].duration;
		if (duration && elapsed >= duration) tour.advance();
	});
	return null;
}
