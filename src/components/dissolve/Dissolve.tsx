import { useDissolveStore } from "../../../stores/useDissolveStore";
import DissolveAnimator from "./components/DissolveAnimator";
import DissolveBook from "./components/DissolveBook";

const Dissolve = ({ paused = false }: { paused?: boolean }) => {
	const dissolveProgress = useDissolveStore((state) => state.dissolveProgress);

	return (
		<>
			<DissolveAnimator paused={paused} />
			<DissolveBook dissolveProgress={dissolveProgress} />
		</>
	);
};

export default Dissolve;
