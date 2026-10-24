import { Canvas } from "@react-three/fiber";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { books as catalog } from "../lib/bookCatalog";
import { publicAssetUrl } from "../lib/publicAssetUrl";
import { currentRenderQuality } from "../lib/renderQuality";
import {
	BEATS,
	type BeatId,
	beatAt,
	createJourney,
	endVisible,
	glideTo,
	type JourneyState,
	MAX_INPUT_STEP,
	nextStation,
	queueStep,
	showScrollHint,
	soundtrackDrives,
	touchStep,
	wheelStep,
} from "./journey";
import "./onboarding.css";
import OnboardingScene from "./scene";
import { planLandings } from "./selection";
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
	const quality = useMemo(() => currentRenderQuality(), []);
	const rootRef = useRef<HTMLDivElement>(null);
	const journeyRef = useRef<JourneyState>(createJourney());
	const clockRef = useRef(0);
	const reducedRef = useRef(false);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const phaseRef = useRef<Phase>("intro");
	const endRef = useRef(false);
	const beatIdRef = useRef("");
	const answersRef = useRef<Answers>({
		bookTitle: "",
		rhythm: "",
		identity: "",
	});
	const [phase, setPhase] = useState<Phase>("intro");
	const [ready, setReady] = useState(false);
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
		const journey = journeyRef.current;
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
		const end = endVisible(display, endRef.current);
		const root = rootRef.current;
		if (root) {
			root.dataset.progress = display.toFixed(4);
			root.dataset.beat = end ? "" : beatId;
			root.dataset.end = end ? "true" : "false";
		}
		if (beatId !== beatIdRef.current || end !== endRef.current) {
			beatIdRef.current = beatId;
			endRef.current = end;
			setHud({ beatId: beat?.id ?? null, end });
		}
	}, []);

	const onReady = useCallback(() => setReady(true), []);

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
		let stationLock = 0;

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

		const stepStation = (direction: 1 | -1) => {
			const now = performance.now();
			if (now - stationLock < 320) return;
			stationLock = now;
			seekJourney(nextStation(journeyRef.current.display, direction));
		};

		const onWheel = (event: WheelEvent) => {
			if (phaseRef.current !== "journey") return;
			if (cardConsumes(event.target, event.deltaY)) return;
			event.preventDefault();
			if (reducedRef.current) {
				if (event.deltaY === 0) return;
				stepStation(event.deltaY > 0 ? 1 : -1);
				return;
			}
			queueStep(journeyRef.current, wheelStep(event.deltaY, event.deltaMode));
		};

		const onPointerDown = (event: PointerEvent) => {
			if (event.pointerType === "mouse" && event.button !== 0) return;
			if (event.pointerType === "mouse") return;
			if (interactiveTarget(event.target)) return;
			pointerId = event.pointerId;
			lastY = event.clientY;
		};

		const onPointerMove = (event: PointerEvent) => {
			if (pointerId !== event.pointerId || phaseRef.current !== "journey")
				return;
			const dy = event.clientY - lastY;
			lastY = event.clientY;
			if (dy === 0 || cardConsumes(event.target, dy)) return;
			if (reducedRef.current) {
				stepStation(dy < 0 ? 1 : -1);
				return;
			}
			queueStep(journeyRef.current, touchStep(-dy));
		};

		const onPointerUp = (event: PointerEvent) => {
			if (pointerId === event.pointerId) pointerId = null;
		};

		const onKey = (event: KeyboardEvent) => {
			if (phaseRef.current !== "journey") return;
			if (interactiveTarget(event.target)) return;
			let direction: 1 | -1 | 0 = 0;
			if (
				event.key === "ArrowDown" ||
				event.key === "PageDown" ||
				event.key === " "
			) {
				direction = 1;
			} else if (event.key === "ArrowUp" || event.key === "PageUp") {
				direction = -1;
			}
			if (direction === 0) return;
			event.preventDefault();
			if (reducedRef.current) stepStation(direction);
			else queueStep(journeyRef.current, direction * MAX_INPUT_STEP);
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
		seekJourney(BEATS[0].t);
	};

	const finish = () => {
		const profile: OnboardingProfile = {
			...answersRef.current,
			createdAt: new Date().toISOString(),
		};
		saveOnboardingProfile(profile);
		audioRef.current?.pause();
		void navigate({ to: "/" });
	};

	const replay = () => {
		const audio = audioRef.current;
		if (audio) {
			audio.pause();
			audio.currentTime = 0;
		}
		setSound((current) => (current === "playing" ? "off" : current));
		journeyRef.current = createJourney();
		clockRef.current = 0;
		phaseRef.current = "intro";
		beatIdRef.current = "";
		endRef.current = false;
		setPhase("intro");
		setAnswers({ bookTitle: "", rhythm: "", identity: "" });
		setHud({ beatId: null, end: false });
		const root = rootRef.current;
		if (root) {
			root.dataset.progress = "0.0000";
			root.dataset.beat = "";
			root.dataset.end = "false";
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
			audio.currentTime = journeyRef.current.display * audio.duration;
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
			data-reduced={reduced ? "true" : "false"}
			data-books={bookTitles}
		>
			<div className={ready ? "onb-stage is-ready" : "onb-stage"}>
				<Canvas
					dpr={quality.dpr}
					shadows={false}
					gl={{
						alpha: false,
						antialias: quality.tier === "high",
						powerPreference: "high-performance",
					}}
					onCreated={({ gl }) => gl.setClearColor("#101828")}
				>
					<OnboardingScene
						journeyRef={journeyRef}
						clockRef={clockRef}
						reducedRef={reducedRef}
						audioRef={audioRef}
						phaseRef={phaseRef}
						answers={selection}
						onProgress={onProgress}
						onReady={onReady}
					/>
				</Canvas>
			</div>
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
									seekJourney(nextStation(journeyRef.current.display, 1))
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
