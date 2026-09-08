import { useParticleStore } from "../../../stores/useParticleStore";
import { useBookTextures } from "../book/bookAppearance";
import { getBookTextureUrls } from "../book/bookTextures";
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
	// Load once before the animator mounts; both representations use these exact maps.
	const textures = useBookTextures(
		getBookTextureUrls(bookData.cover, bookData.thumbnail ?? bookData.image),
	);

	return (
		<>
			<ParticleAnimator />
			<ParticleBook
				bookData={bookData}
				textures={textures}
				phase={phase}
				particleProgress={particleProgress}
				bookScale={bookScale}
			/>
			<ParticleSystem3D
				bookData={bookData}
				textures={textures}
				isParticleMode={phase === "forming"}
				particleProgress={particleProgress}
			/>
		</>
	);
};

export default Particles;
