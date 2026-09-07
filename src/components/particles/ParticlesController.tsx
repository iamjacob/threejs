import { useParticleStore } from "../../../stores/useParticleStore";
import { sampleBookData } from "./particleData";

const ParticlesController = () => {
	const phase = useParticleStore((state) => state.phase);
	const requestBook = useParticleStore((state) => state.requestBook);
	const isAnimating = phase === "forming" || phase === "shrinking";

	return (
		<div className="absolute top-24 left-4 z-10">
			<button
				type="button"
				onClick={() => requestBook(sampleBookData)}
				disabled={isAnimating}
				className="rounded-xl border border-white/10 bg-white/[0.08] px-6 py-3 font-semibold text-stone-500 shadow-lg backdrop-blur-xl transition-all hover:bg-white/[0.14] hover:text-stone-300 disabled:cursor-not-allowed disabled:opacity-50"
			>
				Add Book
			</button>
		</div>
	);
};

export default ParticlesController;
