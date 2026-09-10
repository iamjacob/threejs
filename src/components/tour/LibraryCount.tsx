import NumberFlow from "@number-flow/react";
import { useLevelStore } from "../../stores/useLevelStore";
import { progressionConfig } from "../shelves/progressionConfig";

export default function LibraryCount() {
	const level = useLevelStore((state) => state.levelIndex);
	const count = progressionConfig.levels[level].minBooks;

	return (
		<div>
			<p className="text-sm leading-relaxed text-white/75 sm:text-base">
				Level {level} / {progressionConfig.levels.length - 1}
			</p>
			<h2 className="flex items-baseline gap-3 text-white sm:gap-4">
				<NumberFlow
					value={count}
					prefix="+"
					locales="en"
					format={{ useGrouping: true }}
					transformTiming={{
						duration: 900,
						easing: "cubic-bezier(0.22, 1, 0.36, 1)",
					}}
					opacityTiming={{ duration: 300, easing: "ease-out" }}
					className="text-[88px] font-medium leading-none tracking-[-0.06em] tabular-nums [--number-flow-mask-height:0.12em] sm:text-[128px]"
				/>
				<span className="text-lg font-normal text-white/80 sm:text-2xl">
					{count === 1 ? "book" : "books"}
				</span>
			</h2>
		</div>
	);
}
