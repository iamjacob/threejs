import { type RefObject, useEffect, useRef, useState } from "react";
import {
	createScannerPortalRenderer,
	portalOpeningScale,
} from "./scannerPortalRenderer";

type ScannerPortalProps = {
	video?: RefObject<HTMLVideoElement | null>;
	live?: boolean;
	className?: string;
	onFallbackChange?: (fallback: boolean) => void;
};

export default function ScannerPortal({
	video,
	live = false,
	className,
	onFallbackChange,
}: ScannerPortalProps) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const liveRef = useRef(live);
	const fallbackCallback = useRef(onFallbackChange);
	const wake = useRef<(() => void) | null>(null);
	const [fallback, setFallback] = useState(false);
	liveRef.current = live;
	fallbackCallback.current = onFallbackChange;

	useEffect(() => {
		const surface = canvas.current;
		if (!surface) return;
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		let reducedMotion = motion.matches;
		let renderer: ReturnType<typeof createScannerPortalRenderer> = null;
		let releaseContext: (() => void) | null = null;
		let frame = 0;
		let lastFrame = -Infinity;
		let openedAt = performance.now();
		let active = true;
		const stop = () => {
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
		};
		const notifyFallback = (value: boolean) => {
			if (!active) return;
			setFallback(value);
			fallbackCallback.current?.(value);
		};
		const fail = () => {
			stop();
			renderer?.dispose();
			renderer = null;
			notifyFallback(true);
		};
		const requestFrame = () => {
			if (active && renderer && !document.hidden && !frame)
				frame = requestAnimationFrame(draw);
		};
		const draw = (now: number) => {
			frame = 0;
			if (!active || !renderer || document.hidden) return;
			if (now - lastFrame >= 1000 / 30) {
				try {
					renderer.draw({
						time: reducedMotion ? 0 : now / 1000,
						scale: portalOpeningScale(now - openedAt, reducedMotion),
						live: liveRef.current,
						video: video?.current,
						pixelRatio: window.devicePixelRatio,
					});
					lastFrame = now;
				} catch {
					fail();
					return;
				}
			}
			if (!reducedMotion || liveRef.current) requestFrame();
		};
		const initialize = () => {
			stop();
			renderer?.dispose();
			try {
				renderer = createScannerPortalRenderer(surface);
				if (!renderer) {
					fail();
					return;
				}
				const current = renderer;
				releaseContext = () => current.dispose(true);
				openedAt = performance.now();
				lastFrame = -Infinity;
				notifyFallback(false);
				requestFrame();
			} catch {
				fail();
			}
		};
		const resize = () => {
			lastFrame = -Infinity;
			requestFrame();
		};
		const visibility = () => {
			if (document.hidden) stop();
			else resize();
		};
		const changeMotion = () => {
			reducedMotion = motion.matches;
			resize();
		};
		const contextLost = (event: Event) => {
			event.preventDefault();
			fail();
		};
		const observer =
			typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
		observer?.observe(surface);
		window.addEventListener("resize", resize);
		document.addEventListener("visibilitychange", visibility);
		motion.addEventListener("change", changeMotion);
		surface.addEventListener("webglcontextlost", contextLost);
		surface.addEventListener("webglcontextrestored", initialize);
		wake.current = resize;
		initialize();
		return () => {
			active = false;
			wake.current = null;
			stop();
			observer?.disconnect();
			window.removeEventListener("resize", resize);
			document.removeEventListener("visibilitychange", visibility);
			motion.removeEventListener("change", changeMotion);
			surface.removeEventListener("webglcontextlost", contextLost);
			surface.removeEventListener("webglcontextrestored", initialize);
			releaseContext?.();
		};
	}, [video]);

	useEffect(() => {
		wake.current?.();
	}, [live]);

	return (
		<div
			className={`scanner-portal${className ? ` ${className}` : ""}`}
			data-fallback={fallback}
			aria-hidden="true"
			style={{ pointerEvents: "none" }}
		>
			<canvas className="scanner-portal-canvas" ref={canvas} />
		</div>
	);
}
