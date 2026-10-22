/**
 * Boooks wordmark with a glowing bar that slides back and forth (ping-pong) while loading.
 * Pure CSS animation (`.boooks-shuttle` in styles.css): no timers, no React state, so it keeps
 * moving even while the main thread is busy compiling shaders or decoding covers.
 */
export default function LoaderMark({ className = "" }: { className?: string }) {
	return (
		<div className={`flex flex-col items-center gap-5 ${className}`}>
			<img
				src={`${import.meta.env.BASE_URL}icons/wordmark-gradient.svg`}
				alt="Boooks"
				className="h-auto w-40 select-none drop-shadow-[0_8px_28px_rgba(226,36,36,0.22)] sm:w-48"
			/>
			<div className="boooks-shuttle-track" aria-hidden="true">
				<div className="boooks-shuttle" data-testid="loader-shuttle" />
			</div>
		</div>
	);
}
