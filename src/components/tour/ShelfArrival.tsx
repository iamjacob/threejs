import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { type Group, MathUtils, Quaternion, Vector3 } from "three";
import { useParticleStore } from "../../../stores/useParticleStore";
import { useSelectedBook } from "../../stores/useBookStore";
import Particles from "../particles/Particles";
import { shelfBookPose } from "../shelves/Bookshelves";

export default function ShelfArrival({ paused }: { paused: boolean }) {
	const camera = useThree((state) => state.camera);
	const book = useSelectedBook();
	const ref = useRef<Group>(null);
	const flight = useMemo(() => {
		const pose = shelfBookPose(book.id);
		const direction = camera.getWorldDirection(new Vector3());
		return {
			start: camera.position.clone().addScaledVector(direction, -2),
			end: new Vector3(...pose.position),
			startRotation: camera.quaternion.clone(),
			endRotation: new Quaternion(...pose.quaternion),
		};
	}, [book.id, camera]);
	useFrame(() => {
		if (!ref.current) return;
		const state = useParticleStore.getState();
		const time =
			state.phase === "forming"
				? (Math.asin(Math.min(1, state.particleProgress)) * 2) / Math.PI
				: 1;
		// Finish the flight before the final particles resolve into a solid cover.
		const progress = MathUtils.smoothstep(time / 0.68, 0, 1);
		ref.current.position.lerpVectors(flight.start, flight.end, progress);
		ref.current.position.y += Math.sin(progress * Math.PI) * 0.5;
		ref.current.quaternion.slerpQuaternions(
			flight.startRotation,
			flight.endRotation,
			progress,
		);
	});
	return (
		<group
			ref={ref}
			name="shelf-arrival"
			userData={{ start: flight.start.toArray(), target: flight.end.toArray() }}
		>
			<Particles paused={paused} floating={false} formationDelay={0.35} />
		</group>
	);
}
