import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { type Group, MathUtils, Quaternion, Vector3 } from "three";
import { useParticleStore } from "../../../stores/useParticleStore";
import { useSelectedBook } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";
import { useShelfControlsStore } from "../../../stores/useShelfControlsStore";
import { useBookStore } from "../../stores/useBookStore";
import { arrangeShelfBooks } from "../shelves/shelfArrangement";
import Particles from "../particles/Particles";
import { shelfBookPose } from "../shelves/Bookshelves";

export default function ShelfArrival({ paused }: { paused: boolean }) {
	const camera = useThree((state) => state.camera);
	const book = useSelectedBook();
	const userAddition = useTourStore((state) => state.userAddition);
	const reducedMotion = useMemo(
		() => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		[],
	);
	const ref = useRef<Group>(null);
	const flight = useMemo(() => {
		const pose = shelfBookPose(book.id);
		const direction = camera.getWorldDirection(new Vector3());
		const end = new Vector3(...pose.position);
		const placement = arrangeShelfBooks(
			useBookStore.getState().books,
			useShelfControlsStore.getState().document,
		).find((entry) => entry.book.id === book.id);
		return {
			start: userAddition
				? end
						.clone()
						.add(
							new Vector3(0, reducedMotion ? 0 : 0.35, reducedMotion ? 0 : 1.4),
						)
				: camera.position.clone().addScaledVector(direction, -2),
			end,
			scale: placement?.scale ?? 1,
			startRotation: camera.quaternion.clone(),
			endRotation: new Quaternion(...pose.quaternion),
		};
	}, [book.id, camera, userAddition, reducedMotion]);
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
		if (!reducedMotion)
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
			scale={flight.scale}
			userData={{ start: flight.start.toArray(), target: flight.end.toArray() }}
		>
			<Particles
				paused={paused}
				floating={false}
				formationDelay={userAddition ? 0.12 : 0.35}
				duration={userAddition ? (reducedMotion ? 0.15 : 3.6) : 8}
			/>
		</group>
	);
}
