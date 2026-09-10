import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useParticleStore } from "../../../../stores/useParticleStore";
import type { ParticlePhase } from "../types";

const FORMATION_DURATION_SECONDS = 8;
const SHRINK_DURATION_SECONDS = 1;

const ParticleAnimator = ({ paused = false }: { paused?: boolean }) => {
	const phase = useParticleStore((state) => state.phase);
	const setParticleProgress = useParticleStore(
		(state) => state.setParticleProgress,
	);
	const setBookScale = useParticleStore((state) => state.setBookScale);
	const completeFormation = useParticleStore(
		(state) => state.completeFormation,
	);
	const completeShrink = useParticleStore((state) => state.completeShrink);
	const elapsedRef = useRef(0);
	const previousPhaseRef = useRef<ParticlePhase>(phase);

	useFrame((_, delta) => {
		if (paused) return;
		if (phase !== previousPhaseRef.current) {
			previousPhaseRef.current = phase;
			elapsedRef.current = 0;
		}

		if (phase === "forming") {
			elapsedRef.current = Math.min(
				elapsedRef.current + delta,
				FORMATION_DURATION_SECONDS,
			);
			const time = elapsedRef.current / FORMATION_DURATION_SECONDS;
			const easedProgress = Math.sin((Math.PI * time) / 2);
			setParticleProgress(easedProgress);

			if (time >= 1) completeFormation();
			return;
		}

		if (phase === "shrinking") {
			elapsedRef.current = Math.min(
				elapsedRef.current + delta,
				SHRINK_DURATION_SECONDS,
			);
			const time = elapsedRef.current / SHRINK_DURATION_SECONDS;
			const easedProgress = THREE.MathUtils.smoothstep(time, 0, 1);
			setBookScale(1 - easedProgress);

			if (time >= 1) completeShrink();
		}
	});

	return null;
};

export default ParticleAnimator;
