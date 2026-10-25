import { useEffect, useRef, useState } from "react";
import { openOnboardingCamera, stopCamera } from "./camera";
import { readOnboardingCover } from "./coverRead";
import { captureVideoFrame, librarySearchUrl } from "./personalBook";

type Commit = { title: string; author: string; coverDataUrl: string };

type Status = "idle" | "opening" | "live" | "ready" | "denied" | "unavailable";

type Props = {
	title: string;
	onTitle: (title: string) => void;
	onCommit: (book: Commit) => void;
	onNotNow: () => void;
};

/**
 * Card 2. The camera stays inside this card. It opens only from the button,
 * never from mount, and a denied or missing camera falls back to the title field.
 */
export default function BookMoment({
	title,
	onTitle,
	onCommit,
	onNotNow,
}: Props) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const authorRef = useRef("");
	const [status, setStatus] = useState<Status>("idle");
	const [still, setStill] = useState("");
	const [note, setNote] = useState("");
	const [path, setPath] = useState<"scan" | "aside" | "search">("scan");
	const [search, setSearch] = useState("");
	const [reading, setReading] = useState(false);

	useEffect(
		() => () => {
			stopCamera(streamRef.current);
			streamRef.current = null;
		},
		[],
	);

	useEffect(() => {
		const video = videoRef.current;
		const stream = streamRef.current;
		if (!video || !stream || status !== "live") return;
		video.srcObject = stream;
		void video.play().catch(() => undefined);
	}, [status]);

	const openCamera = async () => {
		if (status === "opening" || status === "live") return;
		setStatus("opening");
		setNote("");
		try {
			const stream = await openOnboardingCamera();
			streamRef.current = stream;
			setStill("");
			setPath("scan");
			setStatus("live");
		} catch (error) {
			const denied = error instanceof Error && error.name === "denied";
			setStatus(denied ? "denied" : "unavailable");
			setNote(
				denied
					? "Camera permission was denied. Type the title instead."
					: "No camera is available. Type the title instead.",
			);
			inputRef.current?.focus();
		}
	};

	const capture = async () => {
		const video = videoRef.current;
		if (!video || reading) return { frame: still, title: title.trim() };
		const frame = captureVideoFrame(video);
		if (!frame) return { frame: still, title: title.trim() };
		setStill(frame);
		setReading(true);
		setNote("");
		let readTitle = title.trim();
		const controller = new AbortController();
		try {
			const read = await readOnboardingCover(frame, controller.signal);
			authorRef.current = read.author;
			if (read.title) {
				readTitle = read.title.trim();
				onTitle(readTitle);
			} else setNote("Type the title instead.");
		} catch {
			setNote("Type the title instead.");
		} finally {
			setReading(false);
			stopCamera(streamRef.current);
			streamRef.current = null;
			setStatus("ready");
		}
		return { frame, title: readTitle };
	};

	const commit = async () => {
		let cover = still;
		let nextTitle = (path === "search" ? search : title).trim();
		if (path !== "search" && status === "live" && !still) {
			const shot = await capture();
			cover = shot.frame;
			if (shot.title) nextTitle = shot.title;
		}
		if (!nextTitle) {
			inputRef.current?.focus();
			return;
		}
		onCommit({
			title: nextTitle,
			author: authorRef.current,
			coverDataUrl: cover,
		});
	};

	const showStage = status === "live" || Boolean(still);

	return (
		<div className="onb-moment" data-scan={status} data-path={path}>
			{showStage ? (
				<div className="onb-scan">
					{status === "live" ? (
						<video
							ref={videoRef}
							autoPlay
							playsInline
							muted
							data-testid="onboarding-camera"
						/>
					) : (
						<img src={still} alt="" />
					)}
				</div>
			) : null}
			{path === "aside" ? (
				<div className="onb-choices">
					<button
						type="button"
						className="onb-choice"
						data-testid="onboarding-find-book"
						onClick={() => setPath("search")}
					>
						Find a book
					</button>
					<button
						type="button"
						className="onb-choice"
						data-testid="onboarding-find-library"
						onClick={() => {
							window.open(librarySearchUrl(), "_blank", "noopener,noreferrer");
						}}
					>
						Find a library near me
					</button>
				</div>
			) : null}
			{path === "search" ? (
				<input
					data-testid="onboarding-book-search"
					value={search}
					placeholder="Title or author"
					autoComplete="off"
					enterKeyHint="done"
					onChange={(event) => setSearch(event.target.value)}
				/>
			) : null}
			{path === "scan" ? (
				<>
					{status !== "live" && status !== "opening" ? (
						<button
							type="button"
							className="onb-choice"
							data-testid="onboarding-open-camera"
							onClick={() => void openCamera()}
						>
							Open camera
						</button>
					) : null}
					{status === "live" ? (
						<button
							type="button"
							className="onb-choice"
							data-testid="onboarding-capture"
							onClick={() => void capture()}
						>
							{reading ? "Reading the cover…" : "Capture"}
						</button>
					) : null}
					<input
						ref={inputRef}
						data-testid="onboarding-book-title"
						value={title}
						placeholder="Book title"
						autoComplete="off"
						enterKeyHint="done"
						onChange={(event) => onTitle(event.target.value)}
					/>
					<button
						type="button"
						className="onb-choice"
						data-testid="onboarding-not-reading"
						onClick={() => setPath("aside")}
					>
						Not reading right now
					</button>
				</>
			) : null}
			{note ? (
				<p className="onb-note" data-testid="onboarding-camera-note">
					{note}
				</p>
			) : null}
			<button
				type="button"
				className="onb-primary"
				data-testid="onboarding-shelf"
				onClick={() => void commit()}
			>
				Put it on my shelf
			</button>
			<button
				type="button"
				className="onb-quiet onb-block"
				data-testid="onboarding-not-now"
				onClick={onNotNow}
			>
				Not now
			</button>
		</div>
	);
}
