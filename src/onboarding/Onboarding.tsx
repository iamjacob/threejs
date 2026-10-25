import { useNavigate } from "@tanstack/react-router";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { books as catalog } from "../lib/bookCatalog";
import { publicAssetUrl } from "../lib/publicAssetUrl";
import {
	BEATS,
	type BeatId,
	beatAt,
	glideTo,
	nextStation,
	queueStep,
	releasePointer,
	showScrollHint,
	soundtrackDrives,
	touchStep,
	trackPointer,
	wheelStep,
} from "./journey";
import { journeySession, resetJourneySession } from "./session";
import "./onboarding.css";
import { planLandings } from "./selection";
import {
	adoptStageForJourney,
	enterLibraryStage,
	releaseStage,
	requestLibraryPreload,
	setStageAnswers,
	stageElement,
} from "./stageHost";
import {
	ONBOARDING_TRACK_PATH,
	type OnboardingProfile,
	saveOnboardingProfile,
} from "./storage";

type Phase = "intro" | "journey";
type Sound = "off" | "playing" | "unavailable";
type Answers = { bookTitle: string; rhythm: string; identity: string };

const WORDMARK = publicAssetUrl("/icons/wordmark-gradient.svg");

function interactiveTarget(target: EventTarget | null) {
	return target instanceof Element
		? target.closest("input, textarea, button, a, select, label")
		: null;
}

export default function Onboarding() {
	const navigate = useNavigate();
	const rootRef = useRef<HTMLDivElement>(null);
	const phaseRef = journeySession.phase;
	const reducedRef = journeySession.reduced;
	const audioRef = journeySession.audio;
	const endRef = useRef(false);
	const beatIdRef = useRef("");
	const answersRef = useRef<Answers>({
		bookTitle: "",
		rhythm: "",
		identity: "",
	});
	const [phase, setPhase] = useState<Phase>("intro");
	const [reduced, setReduced] = useState(false);
	const [coarse, setCoarse] = useState(false);
	const [sound, setSound] = useState<Sound>("off");
	const [answers, setAnswers] = useState<Answers>({
		bookTitle: "",
		rhythm: "",
		identity: "",
	});
	const [hud, setHud] = useState<{ beatId: BeatId | null; end: boolean }>({
		beatId: null,
		end: false,
	});
	answersRef.current = answers;

	const selection = useMemo(
		() => ({ rhythm: answers.rhythm, identity: answers.identity }),
		[answers.rhythm, answers.identity],
	);
	const bookTitles = useMemo(
		() =>
			planLandings(catalog, selection)
				.flatMap((landing) =>
					landing.placements.map((placement) => placement.book.title),
				)
				.join("|"),
		[selection],
	);

	const seekJourney = useCallback((progress: number) => {
		const journey = journeySession.journey;
		glideTo(journey, progress);
		if (reducedRef.current) journey.display = journey.target;
		const audio = audioRef.current;
		if (
			audio &&
			soundtrackDrives(
				audio.paused,
				audio.ended,
				audio.duration,
				reducedRef.current,
			)
		) {
			audio.currentTime = journey.target * audio.duration;
		}
	}, []);

	const onProgress = useCallback((display: number) => {
		const beat = beatAt(display);
		const beatId = beat?.id ?? "";
		const end = journeySession.falloff.active;
		const root = rootRef.current;
		if (root) {
			root.dataset.progress = display.toFixed(4);
			root.dataset.beat = end ? "" : beatId;
			root.dataset.end = end ? "true" : "false";
		}
		if (display >= 0.78 || end) requestLibraryPreload();
		if (beatId !== beatIdRef.current || end !== endRef.current) {
			beatIdRef.current = beatId;
			endRef.current = end;
			setHud({ beatId: beat?.id ?? null, end });
		}
	}, []);

	const onReady = useCallback(() => {
		stageElement()?.classList.add("is-ready");
	}, []);

	const arrive = useCallback(() => {
		if (journeySession.arrived || journeySession.phase.current !== "journey") {
			return;
		}
		journeySession.arrived = true;
		const profile: OnboardingProfile = {
			...answersRef.current,
			createdAt: new Date().toISOString(),
		};
		saveOnboardingProfile(profile);
		audioRef.current?.pause();
		enterLibraryStage();
		void navigate({ to: "/" });
	}, [navigate]);

	journeySession.onProgress = onProgress;
	journeySession.onReady = onReady;
	journeySession.onArrived = arrive;
	journeySession.onArrival = (progress: number) => {
		const root = rootRef.current;
		if (!root) return;
		root.dataset.arrival = progress.toFixed(4);
		const arriving = progress > 0 ? "true" : "false";
		if (root.dataset.arriving !== arriving) root.dataset.arriving = arriving;
	};

	useLayoutEffect(() => {
		adoptStageForJourney();
	}, []);

	useEffect(() => {
		setStageAnswers(selection);
	}, [selection]);

	useEffect(() => {
		window.scrollTo(0, 0);
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, []);

	useEffect(() => {
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const pointer = window.matchMedia("(pointer: coarse)");
		const applyMotion = () => {
			reducedRef.current = motion.matches;
			setReduced(motion.matches);
		};
		const applyPointer = () => setCoarse(pointer.matches);
		applyMotion();
		applyPointer();
		motion.addEventListener("change", applyMotion);
		pointer.addEventListener("change", applyPointer);
		return () => {
			motion.removeEventListener("change", applyMotion);
			pointer.removeEventListener("change", applyPointer);
		};
	}, []);

	useEffect(() => {
		const audio = new Audio();
		audio.preload = "none";
		audio.muted = true;
		audioRef.current = audio;
		const fail = () => setSound("unavailable");
		audio.addEventListener("error", fail);
		return () => {
			audio.removeEventListener("error", fail);
			audio.pause();
			audioRef.current = null;
		};
	}, []);

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		let pointerId: number | null = null;
		let lastY = 0;
		let lastMove = 0;
		let lastSpeed = 0;
		let stationLock = 0;
		const viewport = () => root.clientHeight || window.innerHeight || 800;

		const cardConsumes = (target: EventTarget | null, deltaY: number) => {
			const card = root.querySelector(".onb-card");
			if (!(card instanceof HTMLElement) || !(target instanceof Node))
				return false;
			if (!card.contains(target)) return false;
			if (card.scrollHeight <= card.clientHeight + 1) return false;
			const atTop = card.scrollTop <= 0;
			const atBottom =
				card.scrollTop + card.clientHeight >= card.scrollHeight - 1;
			if (deltaY > 0) return !atBottom;
			if (deltaY < 0) return !atTop;
			return false;
		};

		const forward = (step: number) => {
			if (journeySession.falloff.active || journeySession.arrival.committed)
				return;
			queueStep(journeySession.journey, step);
		};

		const stepStation = () => {
			const now = performance.now();
			if (now - stationLock < 320) return;
			stationLock = now;
			if (journeySession.falloff.active || journeySession.arrival.committed)
				return;
			seekJourney(nextStation(journeySession.journey.display));
		};

		const onWheel = (event: WheelEvent) => {
			if (phaseRef.current !== "journey") return;
			if (cardConsumes(event.target, event.deltaY)) return;
			event.preventDefault();
			if (event.deltaY <= 0) return;
			if (reducedRef.current) {
				stepStation();
				return;
			}
			forward(wheelStep(event.deltaY, event.deltaMode, viewport()));
		};

		const onPointerDown = (event: PointerEvent) => {
			if (event.pointerType === "mouse" && event.button !== 0) return;
			if (event.pointerType === "mouse") return;
			if (interactiveTarget(event.target)) return;
			pointerId = event.pointerId;
			lastY = event.clientY;
			lastMove = performance.now();
			lastSpeed = 0;
			const journey = journeySession.journey;
			journey.coasting = false;
			journey.velocity = 0;
		};

		const onPointerMove = (event: PointerEvent) => {
			if (pointerId !== event.pointerId || phaseRef.current !== "journey")
				return;
			const now = performance.now();
			const dy = event.clientY - lastY;
			const dt = now - lastMove;
			lastY = event.clientY;
			lastMove = now;
			if (dy === 0 || cardConsumes(event.target, dy)) {
				if (cardConsumes(event.target, dy)) lastSpeed = 0;
				return;
			}
			// Finger up travels forward. A downward drag does not rewind.
			if (dy > 0) {
				lastSpeed = 0;
				return;
			}
			if (reducedRef.current) {
				lastSpeed = 0;
				stepStation();
				return;
			}
			const step = touchStep(-dy, viewport());
			if (journeySession.falloff.active || journeySession.arrival.committed) {
				lastSpeed = 0;
				return;
			}
			trackPointer(journeySession.journey, step);
			lastSpeed = dt > 0 && dt < 80 ? step / (dt / 1000) : 0;
		};

		const onPointerUp = (event: PointerEvent) => {
			if (pointerId !== event.pointerId) return;
			pointerId = null;
			const rested = performance.now() - lastMove > 64;
			releasePointer(journeySession.journey, rested ? 0 : lastSpeed);
			lastSpeed = 0;
		};

		const onKey = (event: KeyboardEvent) => {
			if (phaseRef.current !== "journey") return;
			if (interactiveTarget(event.target)) return;
			const keyAdvances =
				event.key === "ArrowDown" ||
				event.key === "PageDown" ||
				event.key === " ";
			if (!keyAdvances) return;
			event.preventDefault();
			if (reducedRef.current) {
				stepStation();
				return;
			}
			// Arrow and Space are one notch. PageDown is one of the twenty pages.
			const step =
				event.key === "PageDown"
					? wheelStep(1, 2, viewport())
					: wheelStep(100, 0, viewport());
			forward(step);
		};

		const onTouchMove = (event: TouchEvent) => {
			if (phaseRef.current !== "journey" || event.touches.length !== 1) return;
			const touch = event.touches[0];
			if (cardConsumes(event.target, 1) || cardConsumes(event.target, -1))
				return;
			if (interactiveTarget(touch.target)) return;
			event.preventDefault();
		};

		root.addEventListener("wheel", onWheel, { passive: false });
		root.addEventListener("pointerdown", onPointerDown);
		root.addEventListener("pointermove", onPointerMove);
		root.addEventListener("pointerup", onPointerUp);
		root.addEventListener("pointercancel", onPointerUp);
		root.addEventListener("touchmove", onTouchMove, { passive: false });
		window.addEventListener("keydown", onKey);
		return () => {
			root.removeEventListener("wheel", onWheel);
			root.removeEventListener("pointerdown", onPointerDown);
			root.removeEventListener("pointermove", onPointerMove);
			root.removeEventListener("pointerup", onPointerUp);
			root.removeEventListener("pointercancel", onPointerUp);
			root.removeEventListener("touchmove", onTouchMove);
			window.removeEventListener("keydown", onKey);
		};
	}, [seekJourney]);

	const start = () => {
		phaseRef.current = "journey";
		setPhase("journey");
	};

	const finish = () => {
		const profile: OnboardingProfile = {
			...answersRef.current,
			createdAt: new Date().toISOString(),
		};
		saveOnboardingProfile(profile);
		audioRef.current?.pause();
		releaseStage();
		resetJourneySession();
		void navigate({ to: "/" });
	};

	const replay = () => {
		if (journeySession.arrived) return;
		const audio = audioRef.current;
		if (audio) {
			audio.pause();
			audio.currentTime = 0;
		}
		setSound((current) => (current === "playing" ? "off" : current));
		resetJourneySession();
		phaseRef.current = "intro";
		beatIdRef.current = "";
		endRef.current = false;
		setPhase("intro");
		setAnswers({ bookTitle: "", rhythm: "", identity: "" });
		setStageAnswers({ rhythm: "", identity: "" });
		setHud({ beatId: null, end: false });
		const root = rootRef.current;
		if (root) {
			root.dataset.progress = "0.0000";
			root.dataset.beat = "";
			root.dataset.end = "false";
			root.dataset.arrival = "0.0000";
			root.dataset.arriving = "false";
		}
	};

	const toggleSound = () => {
		const audio = audioRef.current;
		if (!audio) return;
		if (sound === "playing") {
			audio.pause();
			setSound("off");
			return;
		}
		if (!audio.src) audio.src = publicAssetUrl(ONBOARDING_TRACK_PATH);
		audio.muted = false;
		if (Number.isFinite(audio.duration) && audio.duration > 0) {
			audio.currentTime = journeySession.journey.display * audio.duration;
		}
		void audio.play().then(
			() => setSound("playing"),
			() => setSound("unavailable"),
		);
	};

	const beat = hud.beatId ? BEATS.find((item) => item.id === hud.beatId) : null;
	const cardVisible = phase === "journey" && beat != null && !hud.end;
	const hint = showScrollHint(phase, cardVisible, hud.end);
	const selected =
		beat?.id === "reading-rhythm"
			? answers.rhythm
			: beat?.id === "reader-identity"
				? answers.identity
				: "";

	return (
		<div
			ref={rootRef}
			className="onb"
			data-testid="onboarding"
			data-phase={phase}
			data-progress="0.0000"
			data-beat=""
			data-end="false"
			data-arrival="0.0000"
			data-arriving="false"
			data-reduced={reduced ? "true" : "false"}
			data-books={bookTitles}
		>
			<header className="onb-header">
				{phase !== "intro" ? (
					<div className="onb-brand">
						<img src={WORDMARK} alt="Boooks" />
					</div>
				) : (
					<span />
				)}
				<div className="onb-tools">
					<button
						type="button"
						className="onb-tool"
						data-testid="onboarding-sound"
						data-state={sound}
						aria-pressed={sound === "playing"}
						onClick={toggleSound}
					>
						{sound === "playing"
							? "Sound on"
							: sound === "unavailable"
								? "No soundtrack"
								: "Sound"}
					</button>
					{phase === "intro" || !hud.end ? (
						<button
							type="button"
							className="onb-tool"
							data-testid="onboarding-skip"
							onClick={finish}
						>
							Skip
						</button>
					) : null}
				</div>
			</header>
			{phase === "intro" ? (
				<div className="onb-intro">
					<img src={WORDMARK} alt="Boooks" />
					<button type="button" data-testid="onboarding-start" onClick={start}>
						Start introduction
					</button>
				</div>
			) : null}
			{cardVisible && beat ? (
				<div className="onb-card-slot">
					<article
						className="onb-card"
						data-testid="onboarding-card"
						data-step={beat.id}
					>
						<p className="onb-kicker">{beat.label}</p>
						<h2>{beat.title}</h2>
						<p>{beat.description}</p>
						{beat.type === "input" ? (
							<input
								data-testid="onboarding-book-title"
								value={answers.bookTitle}
								placeholder={beat.placeholder}
								autoComplete="off"
								enterKeyHint="done"
								onChange={(event) =>
									setAnswers((current) => ({
										...current,
										bookTitle: event.target.value,
									}))
								}
							/>
						) : null}
						{beat.type === "choice" && beat.options ? (
							<div className="onb-choices">
								{beat.options.map((option) => (
									<button
										key={option}
										type="button"
										className="onb-choice"
										aria-pressed={selected === option}
										onClick={() =>
											setAnswers((current) =>
												beat.id === "reading-rhythm"
													? { ...current, rhythm: option }
													: { ...current, identity: option },
											)
										}
									>
										{option}
									</button>
								))}
							</div>
						) : null}
						{beat.primaryLabel ? (
							<button
								type="button"
								className="onb-primary"
								onClick={() =>
									seekJourney(nextStation(journeySession.journey.display))
								}
							>
								{beat.primaryLabel}
							</button>
						) : null}
					</article>
				</div>
			) : null}
			{hint ? (
				<p className="onb-hint">
					{coarse ? "Swipe to continue" : "Scroll to continue"}
				</p>
			) : null}
			{phase === "journey" && hud.end ? (
				<div className="onb-end" data-testid="onboarding-end">
					<h2>Wish you a great journey...</h2>
					<p>A few pages still count. Come back whenever you are ready.</p>
					<div className="onb-end-actions">
						<button
							type="button"
							data-testid="onboarding-create"
							onClick={finish}
						>
							Create user
						</button>
						<button
							type="button"
							data-testid="onboarding-home"
							onClick={finish}
						>
							Back to home
						</button>
						<button
							type="button"
							className="onb-quiet"
							data-testid="onboarding-replay"
							onClick={replay}
						>
							Replay
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
