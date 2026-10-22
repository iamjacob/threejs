import { useProgress } from "@react-three/drei";
import { useEffect, useState } from "react";
import { useRuntimeAtlas } from "../../lib/runtimeAtlas";
import { useTourStore } from "../../stores/useTourStore";
import LoaderMark from "./LoaderMark";

const FADE_OUT_MS = 650;

/**
 * Full-screen loader for the shelves scene. The bar slides back and forth (indeterminate) instead
 * of a percentage fill, which crept forward on a timer and did not reflect real progress.
 */
export default function MarkLoader() {
	const [active, setActive] = useState(() => useProgress.getState().active);
	const atlasReady = useRuntimeAtlas((state) => state.ready);
	const sceneReady = useTourStore((state) => state.ready);
	const [booted, setBooted] = useState(() => atlasReady && sceneReady);
	useEffect(() => {
		let frame: number | null = null;
		// Many cached covers can finish together; read the loading flag once per frame.
		const update = () => {
			if (frame !== null) return;
			frame = requestAnimationFrame(() => {
				frame = null;
				setActive(useProgress.getState().active);
			});
		};
		const unsubscribe = useProgress.subscribe(update);
		update();
		return () => {
			unsubscribe();
			if (frame !== null) cancelAnimationFrame(frame);
		};
	}, []);
	useEffect(() => {
		if (!booted && atlasReady && sceneReady) {
			setBooted(true);
		}
	}, [booted, atlasReady, sceneReady]);

	const loading = !booted || active;
	const [mounted, setMounted] = useState(!booted);
	const [fadingOut, setFadingOut] = useState(false);

	useEffect(() => {
		if (loading) {
			setFadingOut(false);
			if (!booted) {
				setMounted(true);
				return;
			}
			// Cached assets resolve immediately; avoid flashing between chapters.
			const showTimer = window.setTimeout(() => setMounted(true), 120);
			return () => window.clearTimeout(showTimer);
		}
		if (!mounted) return;
		setFadingOut(true);
		const hideTimer = window.setTimeout(() => {
			setMounted(false);
			setFadingOut(false);
		}, FADE_OUT_MS);
		return () => window.clearTimeout(hideTimer);
	}, [loading, booted, mounted]);

	if (!mounted) return null;
	return (
		<output
			aria-label="Loading books"
			data-testid="mark-loader"
			className={`pointer-events-none fixed inset-0 z-[2500] flex flex-col items-center justify-center transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
				fadingOut ? "opacity-0" : "opacity-100"
			}`}
			style={{
				background:
					"radial-gradient(circle at 50% 48%, #0e172c 0%, #070b17 58%, #03050b 100%)",
			}}
		>
			<LoaderMark
				className={`transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
					fadingOut
						? "scale-[1.04] opacity-0 blur-[2px]"
						: "scale-100 opacity-100 blur-0"
				}`}
			/>
		</output>
	);
}
