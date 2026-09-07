import { useDissolveStore } from "../../../stores/useDissolveStore";
import DissolveAnimator from "./components/DissolveAnimator";
import DissolveBook from "./components/DissolveBook";

const Dissolve = () => {
	const dissolveProgress = useDissolveStore((state) => state.dissolveProgress);

	return (
		<>
			<DissolveAnimator />
			<DissolveBook dissolveProgress={dissolveProgress} />
		</>
	);
};

export default Dissolve;
