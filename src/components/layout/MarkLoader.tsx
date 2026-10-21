import { useProgress } from "@react-three/drei";
import { useEffect, useState } from "react";
import { useRuntimeAtlas } from "../../lib/runtimeAtlas";
import { useTourStore } from "../../stores/useTourStore";

const FADE_OUT_MS = 1150;

export default function MarkLoader() {
	const [{ active, progress }, setLoading] = useState(useProgress.getState);
	const atlasReady = useRuntimeAtlas((state) => state.ready);
	const sceneReady = useTourStore((state) => state.ready);
	const [booted, setBooted] = useState(
		() => atlasReady && sceneReady && !useProgress.getState().active,
	);
	useEffect(() => {
		let frame: number | null = null;
		// Many cached covers can finish together; paint their progress once per frame.
		const update = () => {
			if (frame !== null) return;
			frame = requestAnimationFrame(() => {
				frame = null;
				setLoading(useProgress.getState());
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
		if (!booted && atlasReady && sceneReady && !active) {
			setBooted(true);
		}
	}, [booted, atlasReady, sceneReady, active]);

	const loading = !booted || active;
	const [mounted, setMounted] = useState(!booted);
	const [fadingOut, setFadingOut] = useState(false);
	const [fill, setFill] = useState(() => (booted ? 0 : 16));

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
		setFill(100);
		setFadingOut(true);
		const hideTimer = window.setTimeout(() => {
			setMounted(false);
			setFadingOut(false);
			setFill(0);
		}, FADE_OUT_MS);
		return () => window.clearTimeout(hideTimer);
	}, [loading, booted, mounted]);

	useEffect(() => {
		if (!loading) return;
		const target = !booted
			? Math.max(atlasReady ? 65 : 16, Math.min(96, progress))
			: Math.max(15, Math.min(96, progress));
		setFill((previous) => Math.max(previous, target));
	}, [loading, booted, atlasReady, progress]);

	// Smoothly creep progress while waiting on async decode/packing so the bar never feels stuck.
	useEffect(() => {
		if (!loading) return;
		const interval = window.setInterval(() => {
			setFill((previous) =>
				previous < 92 ? previous + (92 - previous) * 0.08 : previous,
			);
		}, 120);
		return () => window.clearInterval(interval);
	}, [loading]);

	if (!mounted) return null;
	return (
		<output
			aria-label="Loading books"
			className={`pointer-events-none fixed inset-0 z-[2500] flex flex-col items-center justify-center transition-opacity duration-[1150ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
				fadingOut ? "opacity-0" : "opacity-100"
			}`}
			style={{
				background:
					"radial-gradient(circle at 50% 48%, #0e172c 0%, #070b17 58%, #03050b 100%)",
			}}
		>
			<div
				className={`flex flex-col items-center gap-5 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
					fadingOut
						? "scale-[1.04] opacity-0 blur-[2px]"
						: "scale-100 opacity-100 blur-0"
				}`}
			>
				<img
					src={`${import.meta.env.BASE_URL}icons/wordmark-gradient.svg`}
					alt="Boooks"
					className="h-auto w-40 select-none drop-shadow-[0_8px_28px_rgba(226,36,36,0.22)] sm:w-48"
				/>
				<div className="relative h-[3px] w-36 overflow-hidden rounded-full bg-white/[0.08] sm:w-44">
					<div
						className="h-full w-full origin-left rounded-full bg-gradient-to-r from-[#7C1414] via-[#d91b24] to-[#ff4d4d] shadow-[0_0_12px_rgba(226,36,36,0.75)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
						style={{
							transform: `scaleX(${Math.min(100, Math.max(0, fill)) / 100})`,
						}}
					/>
				</div>
			</div>
		</output>
	);
}
