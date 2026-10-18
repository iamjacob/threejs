import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

/**
 * Compile every material currently in the scene off the critical path. Without
 * this, three.js compiles each new shader the first frame it is drawn, which
 * stalls a mobile GPU for 50–300 ms and shows up as single-digit fps dips when
 * a book, glass filter, or dissolve first appears.
 */
export default function ShaderWarmup() {
	const gl = useThree((state) => state.gl);
	const scene = useThree((state) => state.scene);
	const camera = useThree((state) => state.camera);
	useEffect(() => {
		let cancelled = false;
		const warm = () => {
			if (cancelled) return;
			void gl.compileAsync(scene, camera).catch(() => {
				/* Materials that fail here surface when they are actually drawn. */
			});
		};
		// Give the first Suspense boundaries a frame to mount before compiling.
		const handle = requestAnimationFrame(warm);
		return () => {
			cancelled = true;
			cancelAnimationFrame(handle);
		};
	}, [gl, scene, camera]);
	return null;
}
