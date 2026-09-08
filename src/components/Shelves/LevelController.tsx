import { ChevronDownCircle, ChevronUpCircle, Pause, Play } from "lucide-react";
import { useLevelStore } from "../../stores/useLevelStore";
import { progressionConfig } from "./progressionConfig";

const LevelController = () => {
	const levelIndex = useLevelStore((state) => state.levelIndex);
	const isPlaying = useLevelStore((state) => state.isPlaying);
	const togglePlayback = useLevelStore((state) => state.togglePlayback);
	const increaseLevel = useLevelStore((state) => state.increaseLevel);
	const decreaseLevel = useLevelStore((state) => state.decreaseLevel);
	const isFirstLevel = levelIndex === 0;
	const isLastLevel = levelIndex === progressionConfig.levels.length - 1;
	const level = progressionConfig.levels[levelIndex];
	const shelfCount = level.shelves.filter((fraction) => fraction > 0).length;

	return (
		<div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-5 py-3 text-white backdrop-blur-xl">
			<div className="whitespace-nowrap text-center text-sm">
				<p className="font-medium">
					Level {levelIndex} / {progressionConfig.levels.length - 1}
				</p>
				<p className="text-xs text-white/60">
					{shelfCount} shelves · {level.minBooks}+ books
					{isLastLevel ? " · 360°" : ""}
				</p>
			</div>
			<div className="flex items-center gap-3">
				<button
					type="button"
					aria-label="Increase shelf level"
					onClick={increaseLevel}
					disabled={isLastLevel}
					className="order-3 flex h-11 w-11 cursor-pointer touch-manipulation items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/90 hover:bg-white/20 disabled:cursor-default disabled:opacity-40"
				>
					<ChevronUpCircle size={24} />
				</button>

				<button
					type="button"
					aria-label={
						isPlaying ? "Pause shelf autoplay" : "Play shelf autoplay"
					}
					onClick={togglePlayback}
					className="order-2 flex h-11 w-11 cursor-pointer touch-manipulation items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/90 hover:bg-white/20"
				>
					{isPlaying ? <Pause size={20} /> : <Play size={20} />}
				</button>

				<button
					type="button"
					aria-label="Decrease shelf level"
					onClick={decreaseLevel}
					disabled={isFirstLevel}
					className="order-1 flex h-11 w-11 cursor-pointer touch-manipulation items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/90 hover:bg-white/20 disabled:cursor-default disabled:opacity-40"
				>
					<ChevronDownCircle size={24} />
				</button>
			</div>
		</div>
	);
};

export default LevelController;
