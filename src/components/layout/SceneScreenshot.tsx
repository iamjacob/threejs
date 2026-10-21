import { useThree } from "@react-three/fiber";
import { Pause } from "lucide-react";
import { useEffect, useRef } from "react";
import { usePresentationStore } from "../../stores/usePresentationStore";
import { useTourStore } from "../../stores/useTourStore";

export function SceneScreenshot({
	onCaptured,
}: {
	onCaptured: (dataUrl: string) => void;
}) {
	const { gl, scene, camera } = useThree();
	const screenshotKey = usePresentationStore((state) => state.screenshotKey);
	const lastKey = useRef(screenshotKey);
	useEffect(() => {
		if (screenshotKey === lastKey.current) return;
		lastKey.current = screenshotKey;
		try {
			gl.render(scene, camera);
			const dataUrl = gl.domElement.toDataURL("image/png");
			onCaptured(dataUrl);
		} catch {
			/* Fallback if canvas is tainted. */
		}
	}, [screenshotKey, gl, scene, camera, onCaptured]);
	return null;
}

export function CinematicReelBar() {
	return (
		<>
			<div className="pointer-events-none fixed inset-x-0 top-0 z-[1400] h-12 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-700" />
			<div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1400] h-12 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-700" />
			<button
				type="button"
				onClick={() => {
					usePresentationStore.getState().setCinematicPlaying(false);
					useTourStore.setState({ paused: true });
				}}
				className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[1650] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#0b1022]/85 px-4 py-1.5 text-xs font-medium text-[#f5efe2] shadow-lg backdrop-blur-md transition hover:border-[#e22424]/60"
			>
				<Pause size={13} className="text-[#e22424]" />
				<span>Hollywood · Zen Reel</span>
			</button>
		</>
	);
}
