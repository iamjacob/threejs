import { useProgress } from "@react-three/drei";
import { useEffect, useId, useState } from "react";

const MARK =
	"M318.46,488.75c-9.45-6.34-20.12-8.83-31.02-7.27c2.4-5.43,3.57-11,3.4-16.27c-.31-9.71-5.15-17.87-13.62-22.97c-10.76-6.48-27.16-6.32-38.99.37c-10.03,5.67-15.55,15.08-15.55,26.51c0,7.35-.09,67.77-.12,83.29l-.01,3.62c0,3.18,2.58,5.83,5.76,5.89l59.49,1.2c.44.01.88.01,1.32.01c22.64,0,38.77-10.03,44.26-27.51C338.75,518.54,332.19,497.96,318.46,488.75z M266.57,489.6c-.5.35-.79.57-.86.62c-2.55,1.96-3.07,5.53-1.17,8.13c1.9,2.6,5.46,3.2,8.1,1.37c.26-.18.52-.37.74-.53c3.28-2.23,20.55-12.73,38.53-.67c9.47,6.35,14.07,21.41,10.26,33.57c-3.9,12.43-15.61,19.27-32.98,19.27c-.38,0-.77,0-1.14-.01l-53.7-1.08v-1.21c.03-19.42.11-73.04.11-79.95c0-8.97,5.21-13.8,9.57-16.27c8.23-4.65,19.9-4.88,27.13-.53c5.08,3.05,7.74,7.52,7.93,13.27C279.36,473.97,274.08,484.07,266.57,489.6z";

export default function MarkLoader() {
	const [{ active, progress }, setLoading] = useState(useProgress.getState);
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
	const clip = useId();
	const [visible, setVisible] = useState(false);
	const [fill, setFill] = useState(0);
	useEffect(() => {
		if (!active) {
			setVisible(false);
			setFill(0);
			return;
		}
		// Cached assets resolve immediately; avoid flashing between chapters.
		const timer = window.setTimeout(() => setVisible(true), 120);
		return () => window.clearTimeout(timer);
	}, [active]);
	useEffect(() => {
		if (active)
			setFill((previous) => Math.max(previous, Math.min(100, progress)));
	}, [active, progress]);
	if (!active || !visible) return null;
	return (
		<output
			aria-label="Loading books"
			className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[#080d1a]/70 text-white"
		>
			<svg viewBox="195 415 170 180" className="w-28" aria-hidden="true">
				<defs>
					<clipPath id={clip}>
						<path d={MARK} />
					</clipPath>
				</defs>
				<path
					d={MARK}
					fill="none"
					stroke="currentColor"
					strokeOpacity={0.18}
					strokeWidth={2.5}
				/>
				<g clipPath={`url(#${clip})`}>
					<rect
						x={195}
						y={430}
						width={170}
						height={140}
						fill="#d91b24"
						className="transition-transform duration-300 ease-out motion-reduce:transition-none"
						style={{ transform: `translateY(${140 * (1 - fill / 100)}px)` }}
					/>
				</g>
			</svg>
		</output>
	);
}
