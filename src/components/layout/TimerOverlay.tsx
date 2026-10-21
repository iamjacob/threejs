import {
	BookOpen,
	Minimize2,
	Pause,
	Play,
	Plus,
	RotateCcw,
	Sparkles,
	Timer,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSelectedBook } from "../../stores/useBookStore";
import { usePresentationStore } from "../../stores/usePresentationStore";

const PRESETS = [15, 25, 45, 60] as const;

export default function TimerOverlay({
	open,
	onClose,
	onOpen,
	onComplete,
}: {
	open: boolean;
	onClose: () => void;
	onOpen: () => void;
	onComplete: (minutes: number) => void;
}) {
	const selectedBook = useSelectedBook();
	const environment = usePresentationStore((state) => state.environment);
	const setEnvironment = usePresentationStore((state) => state.setEnvironment);
	const [durationMinutes, setDurationMinutes] = useState(25);
	const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
	const [running, setRunning] = useState(false);

	useEffect(() => {
		if (!running) return;
		const id = window.setInterval(() => {
			setRemainingSeconds((prev) => {
				if (prev <= 1) {
					window.clearInterval(id);
					setRunning(false);
					onComplete(durationMinutes);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
		return () => window.clearInterval(id);
	}, [running, durationMinutes, onComplete]);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	const selectPreset = (minutes: number) => {
		setDurationMinutes(minutes);
		setRemainingSeconds(minutes * 60);
		setRunning(false);
	};

	const adjustMinutes = (delta: number) => {
		const next = Math.max(5, Math.min(180, durationMinutes + delta));
		setDurationMinutes(next);
		setRemainingSeconds(next * 60);
		setRunning(false);
	};

	const totalSeconds = Math.max(1, durationMinutes * 60);
	const progress = 1 - remainingSeconds / totalSeconds;
	const mins = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
	const secs = String(remainingSeconds % 60).padStart(2, "0");
	const circumference = 2 * Math.PI * 88;

	if (!open) {
		if (!running && remainingSeconds === durationMinutes * 60) return null;
		return (
			<button
				type="button"
				onClick={onOpen}
				aria-label="Open reading timer"
				className="fixed top-[calc(0.65rem+env(safe-area-inset-top))] left-1/2 z-[1700] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#0b1022]/90 px-3.5 py-1.5 text-xs font-medium text-[#f5efe2] shadow-lg backdrop-blur-md transition hover:border-[#e22424]/60"
			>
				<Timer size={14} className="text-[#e22424]" />
				<span className="font-mono">
					{mins}:{secs}
				</span>
				<span className="h-1.5 w-1.5 rounded-full bg-[#e22424] animate-pulse" />
			</button>
		);
	}

	return (
		<div
			className="fixed inset-0 z-[2100] flex items-center justify-center bg-[#040711]/75 p-4 backdrop-blur-md animate-in fade-in duration-200"
			role="dialog"
			aria-modal="true"
			aria-label="Reading timer"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") onClose();
			}}
		>
			<div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/12 bg-[#0b1022]/95 p-6 text-[#f5efe2] shadow-[0_32px_90px_rgba(0,0,0,0.75)]">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Timer size={16} className="text-[#e22424]" />
						<h2 className="font-semibold text-sm tracking-wide uppercase text-white/90">
							Reading Timer
						</h2>
					</div>
					<div className="flex items-center gap-1.5">
						<button
							type="button"
							onClick={onClose}
							title="Minimize timer"
							aria-label="Minimize timer"
							className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/12 hover:text-white"
						>
							<Minimize2 size={14} />
						</button>
						<button
							type="button"
							onClick={() => {
								setRunning(false);
								setRemainingSeconds(durationMinutes * 60);
								onClose();
							}}
							title="Close timer"
							aria-label="Close timer"
							className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/12 hover:text-white"
						>
							<X size={14} />
						</button>
					</div>
				</div>

				<div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-white/65">
					<BookOpen size={13} className="text-[#e22424]" />
					<span className="truncate max-w-[260px]">
						Session for “{selectedBook.title}”
					</span>
				</div>

				<div className="relative my-6 flex items-center justify-center">
					<svg
						className="h-52 w-52 -rotate-90"
						viewBox="0 0 200 200"
						aria-hidden="true"
					>
						<circle
							cx="100"
							cy="100"
							r="88"
							fill="none"
							stroke="rgba(255,255,255,0.08)"
							strokeWidth="6"
						/>
						<circle
							cx="100"
							cy="100"
							r="88"
							fill="none"
							stroke="url(#timer-red-grad)"
							strokeWidth="6"
							strokeLinecap="round"
							strokeDasharray={circumference}
							strokeDashoffset={circumference * (1 - progress)}
							className="transition-[stroke-dashoffset] duration-500 ease-out"
						/>
						<defs>
							<linearGradient id="timer-red-grad" x1="0" y1="0" x2="1" y2="1">
								<stop offset="0%" stopColor="#7C1414" />
								<stop offset="100%" stopColor="#E22424" />
							</linearGradient>
						</defs>
					</svg>
					<div className="absolute inset-0 flex flex-col items-center justify-center">
						<span className="font-mono font-semibold text-4xl tracking-tight text-white">
							{mins}:{secs}
						</span>
						<span className="mt-1 text-xs uppercase tracking-widest text-white/45">
							{running ? "Focusing" : "Ready"}
						</span>
					</div>
				</div>

				<div className="flex items-center justify-center gap-2">
					{PRESETS.map((minutes) => (
						<button
							key={minutes}
							type="button"
							onClick={() => selectPreset(minutes)}
							className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
								durationMinutes === minutes
									? "bg-gradient-to-r from-[#7C1414] to-[#E22424] text-white shadow"
									: "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
							}`}
						>
							{minutes}m
						</button>
					))}
					<button
						type="button"
						onClick={() => adjustMinutes(5)}
						title="Add 5 minutes"
						className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white"
					>
						<Plus size={12} />
						<span>5m</span>
					</button>
				</div>

				<div className="mt-4 flex items-center justify-center">
					<button
						type="button"
						onClick={() =>
							setEnvironment(environment === "zen" ? "library" : "zen")
						}
						className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
							environment === "zen"
								? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
								: "border-white/10 bg-white/5 text-white/65 hover:text-white"
						}`}
					>
						<Sparkles size={12} />
						<span>
							{environment === "zen"
								? "Zen atmosphere active"
								: "Switch shelf to Zen atmosphere"}
						</span>
					</button>
				</div>

				<div className="mt-6 flex items-center justify-center gap-3">
					<button
						type="button"
						onClick={() => {
							setRunning(false);
							setRemainingSeconds(durationMinutes * 60);
						}}
						aria-label="Reset timer"
						className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
					>
						<RotateCcw size={17} />
					</button>
					<button
						type="button"
						onClick={() => setRunning((r) => !r)}
						className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#7C1414] to-[#E22424] px-7 py-3 font-medium text-sm text-white shadow-[0_10px_28px_rgba(226,36,36,0.4)] transition hover:brightness-110"
					>
						{running ? <Pause size={17} /> : <Play size={17} />}
						<span>{running ? "Pause" : "Start Focus"}</span>
					</button>
				</div>
			</div>
		</div>
	);
}
