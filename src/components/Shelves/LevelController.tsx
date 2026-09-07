import { useState } from "react";
import {ChevronDownCircle, ChevronUpCircle} from "lucide-react";

const LevelController = () => {
  const [level, setLevel] = useState(1);

  return (
    <div className="absolute top-0 right-0 z-[1000] flex h-screen flex-col items-center justify-center overflow-hidden select-none">
      <div
        aria-label={`Level up button`}
        className="relative z-10 mr-4 flex items-center justify-center overflow-hidden rounded-full border border-white/[0.18] bg-white/[0.08] text-[15px] font-medium tracking-wide text-white/90 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:border-white/[0.28] hover:bg-white/[0.14] active:scale-[0.98] active:bg-white/[0.06]"
      >
        <ChevronUpCircle size={24} />
      </div>

      <div
        aria-label={`Level down button`}
        className="relative z-10 mr-4 flex items-center justify-center overflow-hidden rounded-full border border-white/[0.18] bg-white/[0.08] text-[15px] font-medium tracking-wide text-white/90 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:border-white/[0.28] hover:bg-white/[0.14] active:scale-[0.98] active:bg-white/[0.06]"
      >
        <ChevronDownCircle size={24} />
      </div>
    </div>
  );
};

export default LevelController;
