import { useParticleStore } from "../../../stores/useParticleStore";
import { useSelectedBook } from "../../stores/useBookStore";
import { useBookTextures } from "../book/bookAppearance";
import ParticleAnimator from "./components/ParticleAnimator";
import ParticleBook from "./components/ParticleBook";
import ParticleSystem3D from "./components/ParticleSystem3D";

const Particles = ({
	paused = false,
	floating = true,
	formationDelay = 0,
	duration = 8,
}: {
	paused?: boolean;
	floating?: boolean;
	formationDelay?: number;
	duration?: number;
}) => {
	const bookData = useSelectedBook();
	const phase = useParticleStore((state) => state.phase);
	const flightProgress = useParticleStore((state) => state.particleProgress);
	const particleProgress =
		formationDelay > 0
			? Math.max(
					0,
					((Math.asin(Math.min(1, flightProgress)) * 2) / Math.PI -
						formationDelay) /
						(1 - formationDelay),
				)
			: flightProgress;
	const bookScale = useParticleStore((state) => state.bookScale);
	// Load once before the animator mounts; both representations use these exact maps.
	const textures = useBookTextures(bookData.textureUrls);

	return (
		<>
			<ParticleAnimator paused={paused} duration={duration} />
			<ParticleBook
				floating={floating}
				bookData={bookData}
				textures={textures}
				phase={phase}
				particleProgress={particleProgress}
				bookScale={bookScale}
			/>
			<ParticleSystem3D
				floating={floating}
				bookData={bookData}
				textures={textures}
				isParticleMode={phase === "forming"}
				particleProgress={particleProgress}
			/>
		</>
	);
};

export default Particles;
