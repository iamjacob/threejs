import { useParticleStore } from "../../../stores/useParticleStore";
import ParticleAnimator from "./components/ParticleAnimator";
import ParticleBook from "./components/ParticleBook";
import ParticleSystem3D from "./components/ParticleSystem3D";
import { sampleBookData } from "./particleData";

const Particles = () => {
	const bookData = useParticleStore(
		(state) => state.formingBookData ?? sampleBookData,
	);
	const phase = useParticleStore((state) => state.phase);
	const particleProgress = useParticleStore((state) => state.particleProgress);
	const bookScale = useParticleStore((state) => state.bookScale);

	return (
		<>
			<ParticleAnimator />
			<ParticleBook
				bookData={bookData}
				phase={phase}
				particleProgress={particleProgress}
				bookScale={bookScale}
			/>
			<ParticleSystem3D
				bookData={bookData}
				isParticleMode={phase === "forming"}
				particleProgress={particleProgress}
			/>
		</>
	);
};

export default Particles;
