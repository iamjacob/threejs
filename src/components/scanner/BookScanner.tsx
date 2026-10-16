import {
	ArrowRight,
	Camera,
	Check,
	Crop,
	Download,
	ImagePlus,
	Flashlight,
	FlashlightOff,
	LoaderCircle,
	Plus,
	RotateCcw,
	RotateCw,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cameraError, createCameraSession } from "./cameraSession";
import { createCameraTorch } from "./cameraTorch";
import CropCanvas, { cornerNames } from "./CropCanvas";
import ScannerPortal from "./ScannerPortal";
import {
	cropPerspective,
	decodePhoto,
	imageCanvas,
	rotatePhoto,
} from "./cropImage";
import type { Point } from "./perspective";
import type { BookScan, CroppedFace } from "./scannedBook";
import "./scanner.css";

type Step = "requesting" | "camera" | "unavailable" | "crop" | "review";
type Face = "front" | "spine" | "back";
const faceLabel = { front: "Front cover", spine: "Spine", back: "Back cover" };

export default function BookScanner({
	onClose,
	onAdd,
}: {
	onClose: () => void;
	onAdd: (scan: BookScan) => Promise<void>;
}) {
	const [step, setStep] = useState<Step>("requesting");
	const [source, setSource] = useState<HTMLCanvasElement | null>(null);
	const [points, setPoints] = useState<Point[]>([]);
	const [faces, setFaces] = useState<Partial<Record<Face, CroppedFace>>>({});
	const [face, setFace] = useState<Face>("front");
	const [title, setTitle] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [cameraReady, setCameraReady] = useState(false);
	const [portalFallback, setPortalFallback] = useState(false);
	const [stream, setStream] = useState<MediaStream | null>(null);
	const torch = useRef<ReturnType<typeof createCameraTorch> | null>(null);
	const [torchSupported, setTorchSupported] = useState(false);
	const [torchEnabled, setTorchEnabled] = useState(false);
	const [torchPending, setTorchPending] = useState(false);
	const video = useRef<HTMLVideoElement>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const heading = useRef<HTMLHeadingElement>(null);
	const mounted = useRef(true);
	const loadingRevision = useRef(0);
	const adding = useRef(false);
	const crops = useRef<
		Partial<Record<Face, { source: HTMLCanvasElement; points: Point[] }>>
	>({});
	const session = useMemo(
		() =>
			createCameraSession(() => {
				if (!navigator.mediaDevices?.getUserMedia)
					return Promise.reject(new Error("Camera unavailable"));
				return navigator.mediaDevices.getUserMedia({
					audio: false,
					video: {
						facingMode: { ideal: "environment" },
						width: { ideal: 1920 },
						height: { ideal: 2560 },
					},
				});
			}),
		[],
	);
	useEffect(() => {
		mounted.current = true;
		const hide = () => {
			if (!document.hidden) return;
			session.stop();
			setStream(null);
			setCameraReady(false);
			setStep((current) =>
				current === "camera" || current === "requesting"
					? "unavailable"
					: current,
			);
		};
		document.addEventListener("visibilitychange", hide);
		return () => {
			mounted.current = false;
			loadingRevision.current++;
			session.stop();
			document.removeEventListener("visibilitychange", hide);
		};
	}, [session]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Each screen change must move focus to its heading.
	useEffect(() => {
		heading.current?.focus();
	}, [step]);
	useEffect(() => {
		const element = video.current;
		if (!element || !stream || step !== "camera") return;
		element.srcObject = stream;
		void element.play().catch(() => {
			if (!mounted.current || element.srcObject !== stream) return;
			session.stop();
			setStream(null);
			setStep("unavailable");
			setError("The preview couldn’t play. Try again or choose a photo.");
		});
		const ended = () => {
			if (mounted.current) {
				session.stop();
				setStream(null);
				setStep("unavailable");
				setError("The camera stopped. Allow access again to continue.");
			}
		};
		stream.getVideoTracks().forEach((track) => {
			track.addEventListener("ended", ended);
		});
		return () => {
			element.srcObject = null;
			stream.getVideoTracks().forEach((track) => {
				track.removeEventListener("ended", ended);
			});
		};
	}, [stream, step, session]);
	useEffect(() => {
		const control = createCameraTorch(stream?.getVideoTracks()[0] ?? null);
		torch.current = control;
		setTorchSupported(control.supported);
		setTorchEnabled(control.enabled);
		setTorchPending(false);
		return () => {
			control.dispose();
			if (torch.current === control) torch.current = null;
		};
	}, [stream]);
	const toggleTorch = async () => {
		const control = torch.current;
		if (!control?.supported || torchPending) return;
		setTorchPending(true);
		const applied = await control.setEnabled(!control.enabled);
		if (!mounted.current || torch.current !== control) return;
		setTorchEnabled(control.enabled);
		setTorchPending(false);
		if (!applied)
			setError(
				"The flashlight couldn’t switch. Try again or continue without it.",
			);
	};
	const stopCamera = () => {
		session.stop();
		setStream(null);
		setCameraReady(false);
	};
	const close = () => {
		if (adding.current) return;
		loadingRevision.current++;
		stopCamera();
		onClose();
	};
	const back = () => {
		if (busy) return;
		setError("");
		stopCamera();
		if (step === "review") setStep("crop");
		else if (step === "crop" && faces.front) {
			setFace("front");
			const saved = crops.current.front;
			if (saved) {
				setSource(saved.source);
				setPoints(saved.points);
			}
			setStep("review");
		} else if (step === "crop") void startCamera();
		else close();
	};
	const startCamera = useCallback(async () => {
		setError("");
		setStep("requesting");
		setCameraReady(false);
		try {
			const result = await session.start();
			if (!result || !mounted.current) return;
			setStream(result);
			setStep("camera");
		} catch (cause) {
			if (mounted.current) {
				setError(cameraError(cause));
				setStep("unavailable");
			}
		}
	}, [session]);
	// BookScanner only mounts after the user presses Scan or Add a book.
	// getUserMedia itself asks for permission when the browser needs it.
	useEffect(() => {
		void startCamera();
	}, [startCamera]);
	const openPhoto = async (file: File) => {
		if (!file.type.startsWith("image/")) {
			setError("Choose an image of your book.");
			return;
		}
		const revision = ++loadingRevision.current;
		stopCamera();
		setBusy(true);
		setError("");
		try {
			const image = await decodePhoto(file);
			if (!mounted.current || revision !== loadingRevision.current) return;
			setSource(image);
			setPoints([]);
			setStep("crop");
		} catch {
			if (mounted.current && revision === loadingRevision.current)
				setError(
					"That photo couldn’t be opened. Try a JPEG, PNG or WebP image.",
				);
		} finally {
			if (mounted.current && revision === loadingRevision.current)
				setBusy(false);
		}
	};
	const capture = () => {
		if (!video.current || !cameraReady || !video.current.videoWidth) return;
		try {
			setSource(
				imageCanvas(
					video.current,
					video.current.videoWidth,
					video.current.videoHeight,
				),
			);
			setPoints([]);
			stopCamera();
			setStep("crop");
			setError("");
		} catch {
			setError("Couldn’t capture this frame. Please try again.");
		}
	};
	const crop = async () => {
		if (!source || points.length !== 4 || busy) return;
		setBusy(true);
		setError("");
		// Paint the busy state before doing GPU work.
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
		);
		if (!mounted.current) return;
		try {
			const result = cropPerspective(source, points);
			crops.current[face] = { source, points };
			setFaces((current) => ({ ...current, [face]: result }));
			setStep("review");
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Couldn’t crop this photo.",
			);
		} finally {
			setBusy(false);
		}
	};
	const add = async () => {
		if (!faces.front || !title.trim() || adding.current) return;
		adding.current = true;
		setBusy(true);
		setError("");
		try {
			await onAdd({
				title: title.trim(),
				front: faces.front,
				spine: faces.spine,
				back: faces.back,
			});
		} catch {
			if (mounted.current)
				setError(
					"Couldn’t add the book. Your crop is still here — please try again.",
				);
		} finally {
			adding.current = false;
			if (mounted.current) setBusy(false);
		}
	};
	const download = () => {
		const output = faces[face] ?? faces.front;
		if (!output) return;
		const link = document.createElement("a");
		link.href = output.image;
		const extension = output.image.startsWith("data:image/webp")
			? "webp"
			: "png";
		link.download = `${(title.trim() || "book").replace(/[^\p{L}\p{N}._-]+/gu, "-")}.${face}.${extension}`;
		link.click();
	};
	const upload = (
		<button
			type="button"
			className="scan-button scan-secondary"
			disabled={busy}
			onClick={() => fileInput.current?.click()}
		>
			<ImagePlus size={17} /> Choose a photo
		</button>
	);

	return (
		<section
			id="book-scanner"
			data-step={step}
			className="book-scanner"
			aria-label="Add a book"
			onKeyDown={(event) => {
				if (event.key === "Escape") back();
			}}
			onDragOver={(event) => {
				event.preventDefault();
			}}
			onDrop={(event) => {
				event.preventDefault();
				if (!busy && event.dataTransfer.files[0])
					void openPhoto(event.dataTransfer.files[0]);
			}}
		>
			<input
				ref={fileInput}
				type="file"
				accept="image/*"
				hidden
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file) void openPhoto(file);
				}}
			/>
			<header className="scan-header">
				<button
					type="button"
					className="scan-icon"
					style={{ marginLeft: "auto" }}
					aria-label="Close scanner and explore shelf"
					disabled={busy}
					onClick={close}
				>
					<X size={19} />
				</button>
			</header>

			{(step === "camera" ||
				step === "requesting" ||
				step === "unavailable") && (
				<div className="scan-camera-screen">
					<div className="scan-section-title">
						<h1 ref={heading} tabIndex={-1}>
							{step === "requesting"
								? "Opening camera…"
								: step === "unavailable"
									? "Let’s get your camera ready."
									: "Place your cover inside the portal."}
						</h1>
						<p>
							{step === "requesting"
								? "Allow camera access in your browser if asked."
								: step === "unavailable"
									? "Try the camera again or choose a photo below."
									: "Keep all four corners inside the light. Hold steady and capture."}
						</p>
					</div>
					<div
						className="scan-viewfinder scan-portal-viewfinder"
						data-fallback={portalFallback}
					>
						<video
							ref={video}
							autoPlay
							muted
							playsInline
							onLoadedData={() => setCameraReady(true)}
						/>
						<ScannerPortal
							video={video}
							live={cameraReady}
							onFallbackChange={setPortalFallback}
						/>
						<span className="scan-live">
							<i />{" "}
							{step === "camera"
								? "Camera on"
								: step === "requesting"
									? "Waiting for camera"
									: "Camera off"}
						</span>
						{step !== "unavailable" && !cameraReady && (
							<LoaderCircle className="scan-camera-loading scan-spin" />
						)}
					</div>
					<div className="scan-camera-actions">
						{upload}
						{step === "unavailable" ? (
							<button
								type="button"
								className="scan-button scan-primary"
								onClick={() => void startCamera()}
							>
								<Camera size={18} /> Try camera again
							</button>
						) : (
							<button
								className="scan-shutter"
								type="button"
								aria-label="Capture book cover"
								disabled={!cameraReady}
								onClick={capture}
							>
								<span />
							</button>
						)}
						<div className="scan-torch">
							<button
								type="button"
								className="scan-icon"
								aria-label={
									torchSupported
										? torchEnabled
											? "Turn flashlight off"
											: "Turn flashlight on"
										: "Flashlight unavailable for this camera"
								}
								title={
									torchSupported
										? torchEnabled
											? "Turn flashlight off"
											: "Turn flashlight on"
										: "Flashlight unavailable for this camera"
								}
								aria-pressed={torchEnabled}
								disabled={
									!cameraReady || !torchSupported || torchPending || busy
								}
								onClick={() => void toggleTorch()}
							>
								{torchPending ? (
									<LoaderCircle size={20} className="scan-spin" />
								) : torchEnabled ? (
									<Flashlight size={20} />
								) : (
									<FlashlightOff size={20} />
								)}
							</button>
							<span>{torchSupported ? "Flashlight" : "No flashlight"}</span>
						</div>
					</div>
				</div>
			)}
			{step === "crop" && source && (
				<div className="scan-crop-screen">
					<div className="scan-section-title">
						<h1 ref={heading} tabIndex={-1}>
							Just the {face === "front" ? "cover" : face}.
						</h1>
						<p>
							{points.length === 4
								? "Drag the corners to fine-tune your crop."
								: `Tap corner ${points.length + 1}: ${cornerNames[points.length].toLowerCase()}. Continue clockwise.`}
						</p>
					</div>
					<div className="scan-crop-workspace">
						<CropCanvas source={source} points={points} onChange={setPoints} />
						<span className="scan-crop-count">{points.length} / 4 corners</span>
					</div>
					<div className="scan-crop-tools">
						<button
							type="button"
							className="scan-icon"
							aria-label="Rotate photo left"
							onClick={() => {
								setSource(rotatePhoto(source, false));
								setPoints([]);
							}}
						>
							<RotateCcw size={18} />
						</button>
						<button
							type="button"
							className="scan-text-button"
							onClick={() => setPoints([])}
						>
							Reset
						</button>
						<button
							type="button"
							className="scan-text-button"
							onClick={() =>
								setPoints([
									{ x: 0, y: 0 },
									{ x: source.width, y: 0 },
									{ x: source.width, y: source.height },
									{ x: 0, y: source.height },
								])
							}
						>
							Full image
						</button>
						<button
							type="button"
							className="scan-icon"
							aria-label="Rotate photo right"
							onClick={() => {
								setSource(rotatePhoto(source, true));
								setPoints([]);
							}}
						>
							<RotateCw size={18} />
						</button>
					</div>
					<div className="scan-crop-actions">
						<button
							type="button"
							className="scan-button scan-secondary"
							disabled={busy}
							onClick={() => {
								void startCamera();
							}}
						>
							Retake
						</button>
						<button
							type="button"
							className="scan-button scan-primary"
							disabled={busy || points.length !== 4}
							onClick={crop}
						>
							{busy ? (
								<LoaderCircle className="scan-spin" size={17} />
							) : (
								<Crop size={17} />
							)}{" "}
							{busy ? "Cropping…" : "Crop & preview"}
						</button>
					</div>
				</div>
			)}
			{step === "review" && faces.front && (
				<div className="scan-review-screen">
					<div className="scan-section-title">
						<h1 ref={heading} tabIndex={-1}>
							Ready for your shelf.
						</h1>
						<p>A real cover. A little particle magic.</p>
					</div>
					<div className="scan-preview-stage">
						<img
							src={(faces[face] ?? faces.front).image}
							alt={`${title || "Your book"} · ${faceLabel[face]}`}
						/>
						<span className="scan-preview-shadow" />
					</div>
					<div className="scan-review-controls">
						<label className="scan-title-label" htmlFor="scanned-book-title">
							Book title
							<input
								id="scanned-book-title"
								maxLength={160}
								placeholder="What’s the book called?"
								autoComplete="off"
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") void add();
								}}
							/>
						</label>
						<div className="scan-faces">
							{(["front", "spine", "back"] as const).map((value) => (
								<button
									type="button"
									key={value}
									disabled={busy}
									className={face === value ? "is-selected" : ""}
									onClick={() => {
										setFace(value);
										const saved = crops.current[value];
										if (saved) {
											setSource(saved.source);
											setPoints(saved.points);
										} else {
											setPoints([]);
											void startCamera();
										}
									}}
								>
									{faces[value] ? <Check size={13} /> : <Plus size={13} />}
									{faceLabel[value]}
								</button>
							))}
						</div>
						<p className="scan-faces-note">
							Spine and back are optional. We’ll match them to your cover.
						</p>
						<button
							type="button"
							className="scan-button scan-primary"
							disabled={busy || !title.trim()}
							onClick={add}
						>
							{busy ? (
								<LoaderCircle className="scan-spin" size={18} />
							) : (
								<Plus size={18} />
							)}
							{busy ? "Creating your book…" : "Add to shelf"}
							<ArrowRight size={17} />
						</button>
						<div className="scan-review-links">
							<button
								type="button"
								className="scan-text-button"
								disabled={busy}
								onClick={() => setStep("crop")}
							>
								<Crop size={14} /> Adjust crop
							</button>
							<button
								type="button"
								className="scan-text-button"
								disabled={busy}
								onClick={download}
							>
								<Download size={14} /> Download{" "}
								{face === "front" ? "cover" : face}
							</button>
						</div>
					</div>
				</div>
			)}
			{error && (
				<div className="scan-error" role="alert">
					{error}
					<button
						type="button"
						aria-label="Dismiss error"
						onClick={() => setError("")}
					>
						<X size={15} />
					</button>
				</div>
			)}
			{busy && !["crop", "review"].includes(step) && (
				<output className="scan-busy">
					<LoaderCircle className="scan-spin" size={16} /> Opening photo…
				</output>
			)}
		</section>
	);
}
