import { type RefObject, useEffect, useRef, useState } from "react";
import {
	createScannerPortalRenderer,
	PORTAL_SHAPES,
	type PortalFace,
	portalOpeningScale,
} from "./scannerPortalRenderer";

type ScannerPortalProps = {
	video?: RefObject<HTMLVideoElement | null>;
	live?: boolean;
	/** Which part of the book we're framing; sets the window shape. */
	face?: PortalFace;
	className?: string;
	onFallbackChange?: (fallback: boolean) => void;
};

export default function ScannerPortal({
	video,
	live = false,
	face = "front",
	className,
	onFallbackChange,
}: ScannerPortalProps) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const liveRef = useRef(live);
	const shapeRef = useRef<[number, number]>(PORTAL_SHAPES[face]);
	const shapeTarget = useRef<[number, number]>(PORTAL_SHAPES[face]);
	const fallbackCallback = useRef(onFallbackChange);
	const wake = useRef<(() => void) | null>(null);
	const [fallback, setFallback] = useState(false);
	liveRef.current = live;
	shapeTarget.current = PORTAL_SHAPES[face];
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
					// Ease the window toward the face's shape so switching feels alive.
					const target = shapeTarget.current;
					const current = shapeRef.current;
					const k = reducedMotion ? 1 : 0.18;
					shapeRef.current = [
						current[0] + (target[0] - current[0]) * k,
						current[1] + (target[1] - current[1]) * k,
					];
					renderer.draw({
						time: reducedMotion ? 0 : now / 1000,
						scale: portalOpeningScale(now - openedAt, reducedMotion),
						live: liveRef.current,
						video: video?.current,
						pixelRatio: window.devicePixelRatio,
						shape: shapeRef.current,
					});
					lastFrame = now;
				} catch {
					fail();
					return;
				}
			}
			const settling =
				Math.abs(shapeRef.current[0] - shapeTarget.current[0]) > 0.0005 ||
				Math.abs(shapeRef.current[1] - shapeTarget.current[1]) > 0.0005;
			if (!reducedMotion || liveRef.current || settling) requestFrame();
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
	}, [live, face]);

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
