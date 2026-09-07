import { useDissolveStore } from "../../../stores/useDissolveStore";

const DissolveController = () => {
	const dissolveProgress = useDissolveStore((state) => state.dissolveProgress);
	const isDissolving = useDissolveStore((state) => state.isDissolving);
	const startDissolve = useDissolveStore((state) => state.startDissolve);
	const resetDissolve = useDissolveStore((state) => state.resetDissolve);
	const targetProgress = useDissolveStore((state) => state.targetProgress);
	const isAnimating = Math.abs(dissolveProgress - targetProgress) > 0.001;
	const buttonLabel = isAnimating
		? isDissolving
			? "Dissolving..."
			: "Restoring..."
		: isDissolving
			? "Restore Book"
			: "Dissolve Book";

	return (
		<>
			<div className="absolute top-14 left-4 z-10 space-x-4">
				<button
					type="button"
					onClick={isDissolving ? resetDissolve : startDissolve}
					disabled={isAnimating}
					className="rounded-xl border border-white/10 bg-white/[0.08] px-6 py-3 font-semibold text-stone-500 shadow-lg backdrop-blur-xl transition-all hover:bg-white/[0.14] hover:text-stone-300 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{buttonLabel}
				</button>
			</div>

			<div className="absolute top-20 left-4 z-10 text-white">
				{/* <div className="mb-2 text-sm">
					Dissolve Progress: {Math.round(dissolveProgress * 100)}%
				</div> */}
				<div className="h-1 w-40 rounded bg-gray-700">
					<div
						className="h-full rounded bg-red-500 transition-all duration-100"
						style={{ width: `${dissolveProgress * 100}%` }}
					/>
				</div>
			</div>
		</>
	);
};

export default DissolveController;
