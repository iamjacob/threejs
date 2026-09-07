import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { useDissolveStore } from "../../../../stores/useDissolveStore";

const DissolveAnimator = () => {
	const initialProgress = useDissolveStore((state) => state.dissolveProgress);
	const targetProgress = useDissolveStore((state) => state.targetProgress);
	const setDissolveProgress = useDissolveStore(
		(state) => state.setDissolveProgress,
	);
	const progressRef = useRef(initialProgress);

	useFrame(() => {
		const difference = targetProgress - progressRef.current;

		if (Math.abs(difference) > 0.001) {
			progressRef.current += difference * 0.02;
			setDissolveProgress(progressRef.current);
		} else if (progressRef.current !== targetProgress) {
			progressRef.current = targetProgress;
			setDissolveProgress(targetProgress);
		}
	});

	return null;
};

export default DissolveAnimator;
