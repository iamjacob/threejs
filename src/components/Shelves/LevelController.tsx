import { BookPlus, ChevronDownCircle, ChevronUpCircle } from "lucide-react";
import { useLevelStore } from "../../stores/useLevelStore";
import { progressionConfig } from "./progressionConfig";

const LevelController = () => {
  const levelIndex = useLevelStore((state) => state.levelIndex);
  const increaseLevel = useLevelStore((state) => state.increaseLevel);
  const decreaseLevel = useLevelStore((state) => state.decreaseLevel);
  const isFirstLevel = levelIndex === 0;
  const isLastLevel = levelIndex === progressionConfig.levels.length - 1;

  return (
    <div className="pointer-events-none absolute top-0 right-0 z-[1000] flex h-screen flex-col items-center justify-center overflow-hidden gap-2 select-none">
      <button
        type="button"
        aria-label="Increase shelf level"
        onClick={increaseLevel}
        disabled={isLastLevel}
        className="pointer-events-auto relative z-10 mr-4 flex h-12 w-12 cursor-pointer touch-manipulation items-center justify-center overflow-hidden rounded-full border border-white/[0.18] bg-white/[0.08] p-2 text-[15px] font-medium tracking-wide text-white/90 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:border-white/[0.28] hover:bg-white/[0.14] active:scale-[0.98] active:bg-white/[0.06] disabled:cursor-default disabled:opacity-40"
      >
        <ChevronUpCircle size={24} />
      </button>

      <button
        type="button"
        aria-label="Decrease shelf level"
        onClick={decreaseLevel}
        disabled={isFirstLevel}
        className="pointer-events-auto relative z-10 mr-4 flex h-12 w-12 cursor-pointer touch-manipulation items-center justify-center overflow-hidden rounded-full border border-white/[0.18] bg-white/[0.08] p-2 text-[15px] font-medium tracking-wide text-white/90 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:border-white/[0.28] hover:bg-white/[0.14] active:scale-[0.98] active:bg-white/[0.06] disabled:cursor-default disabled:opacity-40"
      >
        <ChevronDownCircle size={24} />
      </button>

      {/* When top level add boooks btn */}
      {/* <BookPlus/> */}
    </div>
  );
};

export default LevelController;
