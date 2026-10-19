import {
	ArrowRight,
	Camera,
	Check,
	Crop,
	Download,
	Flashlight,
	FlashlightOff,
	ImagePlus,
	LoaderCircle,
	Plus,
	RotateCcw,
	RotateCw,
	ScanLine,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bookCatalog } from "../../lib/bookCatalog";
import {
	DEFAULT_BOOK_SIZE_CM,
	formatMeasurement,
	useBookSizeStore,
} from "../../stores/useBookSizeStore";
import type { EnrichmentValues } from "./bookEnrichment";
import { enrichBookMetadata } from "./bookEnrichment";
import CropCanvas, { cornerNames } from "./CropCanvas";
import { cameraError, createCameraSession } from "./cameraSession";
import { createCameraTorch } from "./cameraTorch";
import { cropPerspective, imageCanvas, rotatePhoto } from "./cropImage";
import { detectPhotoCorners } from "./detectPhotoCorners";
import type { Point } from "./perspective";
import ScannerBookForm from "./ScannerBookForm";
import ScannerModelSelect from "./ScannerModelSelect";
import ScannerPortal from "./ScannerPortal";
import ScanProgress from "./ScanProgress";
import {
	loadDrafts,
	newScanDraft,
	type PhotoTag,
	photoData,
	photoTags,
	type ScanDraft,
	type ScanPhoto,
	saveDraft,
} from "./scanDrafts";
import { requestScanMetadata, SCAN_TIMEOUT_MS } from "./scanMetadata";
import type { BookScan, CroppedFace } from "./scannedBook";
import {
	readScannerModel,
	type ScannerModel,
	saveScannerModel,
} from "./scannerModels";
import "./scanner.css";

type Step = "requesting" | "camera" | "unavailable" | "crop" | "review";
type Face = "front" | "spine" | "back";

export default function BookScanner({
	onClose,
	onAdd,
}: {
	onClose: () => void;
	onAdd: (scan: BookScan) => Promise<void>;
}) {
	const [step, setStep] = useState<Step>("requesting");
	const [draftId, setDraftId] = useState(() => newScanDraft().id);
	const [photos, setPhotos] = useState<ScanPhoto[]>([]);
	const [activePhoto, setActivePhoto] = useState<string | null>(null);
	const [history, setHistory] = useState<ScanDraft[]>([]);
	const [enrichment, setEnrichment] = useState<EnrichmentValues>({});
	const unit = useBookSizeStore((state) => state.unit);
	const sizeEntry = useBookSizeStore((state) => state.entries[draftId]);
	const applyEnrichmentSize = useBookSizeStore(
		(state) => state.applyEnrichment,
	);
	const editSize = useBookSizeStore((state) => state.setSize);
	const resetSize = useBookSizeStore((state) => state.reset);
	const setUnit = useBookSizeStore((state) => state.setUnit);
	const size = sizeEntry?.size ?? DEFAULT_BOOK_SIZE_CM;
	const [draftsReady, setDraftsReady] = useState(false);
	const [storageError, setStorageError] = useState(false);
	useEffect(() => {
		loadDrafts()
			.then(setHistory)
			.catch(() => setStorageError(true))
			.finally(() => setDraftsReady(true));
	}, []);

	const [source, setSource] = useState<HTMLCanvasElement | null>(null);
	const [points, setPoints] = useState<Point[]>([]);
	const [faces, setFaces] = useState<Partial<Record<Face, CroppedFace>>>({});
	const [face, setFace] = useState<Face>("front");
	const [title, setTitle] = useState("");
	const [subtitle, setSubtitle] = useState("");
	const [author, setAuthor] = useState("");
	useEffect(() => {
		if (!draftsReady || (!title && !photos.length && !faces.front)) return;
		const draft: ScanDraft = {
			id: draftId,
			title,
			subtitle,
			author,
			photos,
			faces,
			enrichment,
			updated: Date.now(),
		};
		setHistory((current) => [
			draft,
			...current.filter((d) => d.id !== draft.id),
		]);
		void saveDraft(draft)
			.then(() => setStorageError(false))
			.catch(() => setStorageError(true));
	}, [
		draftId,
		title,
		subtitle,
		author,
		photos,
		faces,
		enrichment,
		draftsReady,
	]);

	useEffect(() => {
		const cleanTitle = title.trim();
		if (!cleanTitle || !draftsReady) return;
		const controller = new AbortController();
		setEnrichment((current) => ({
			...current,
			status: "searching",
			activeStep: "Year",
		}));
		const timer = window.setTimeout(() => {
			void enrichBookMetadata(cleanTitle, author, {
				signal: controller.signal,
				coverImage: faces.back?.image ?? faces.front?.image,
				catalog: bookCatalog,
				isbn: enrichment.isbn,
				onUpdate: (update) => {
					setEnrichment((current) => ({ ...current, ...update }));
					if (update.physicalSize && !update.physicalSize.estimated) {
						applyEnrichmentSize(
							draftId,
							{
								height: update.physicalSize.heightCm,
								width: update.physicalSize.widthCm,
								thickness: update.physicalSize.thicknessCm ?? 2.4,
							},
							update.physicalSize.source,
						);
					} else if (update.physicalSize?.estimated) {
						applyEnrichmentSize(
							draftId,
							{
								height: update.physicalSize.heightCm,
								width: update.physicalSize.widthCm,
								thickness: 2.4,
							},
							update.physicalSize.source,
						);
					}
				},
			})
				.then((result) => {
					if (!controller.signal.aborted)
						setEnrichment((current) => ({ ...current, ...result }));
				})
				.catch(() => {
					if (!controller.signal.aborted)
						setEnrichment((current) => ({
							...current,
							status: "partial",
							activeStep: null,
						}));
				});
		}, 700);
		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	}, [
		title,
		author,
		faces.back?.image,
		faces.front?.image,
		enrichment.isbn,
		draftsReady,
		applyEnrichmentSize,
		draftId,
	]);

	const writeSize = (
		axis: keyof typeof DEFAULT_BOOK_SIZE_CM,
		value: number,
	) => {
		editSize(draftId, { [axis]: value });
		setEnrichment((current) => ({ ...current, dimensionsOverridden: true }));
	};

	// Read title/author from the front cover in the background; only fills
	// fields the user left empty. Progress shows up in ScanProgress.
	const frontImage = faces.front?.image;
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run only when the cover or draft changes, not on every keystroke.
	useEffect(() => {
		if (!frontImage || !draftsReady) return;
		const controller = new AbortController();
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const timer = setTimeout(() => {
			setEnrichment((current) => ({
				...current,
				status: "searching",
				activeStep: current.activeStep ?? "Title",
			}));
			timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
			void requestScanMetadata(frontImage, controller.signal)
				.then((metadata) => {
					if (controller.signal.aborted) return;
					if (metadata.title) setTitle((v) => v.trim() || metadata.title);
					if (metadata.subtitle)
						setSubtitle((v) => v.trim() || metadata.subtitle);
					if (metadata.author) setAuthor((v) => v.trim() || metadata.author);
				})
				.catch(() => {
					/* Manual entry still works when the cover reader is unavailable. */
				})
				.finally(() => {
					if (!controller.signal.aborted)
						setEnrichment((current) => ({
							...current,
							activeStep:
								current.activeStep === "Title" ? null : current.activeStep,
						}));
				});
		}, 600);
		return () => {
			clearTimeout(timer);
			if (timeout) clearTimeout(timeout);
			controller.abort();
		};
	}, [frontImage, draftId, draftsReady]);

	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [model, setModel] = useState(readScannerModel);
	const [detection, setDetection] = useState<
		"idle" | "detecting" | "found" | "missed"
	>("idle");
	const detector = useRef<AbortController | null>(null);
	const [cameraReady, setCameraReady] = useState(false);
	const [portalFallback, setPortalFallback] = useState(false);
	const [stream, setStream] = useState<MediaStream | null>(null);
	const torch = useRef<ReturnType<typeof createCameraTorch> | null>(null);
	const [torchSupported, setTorchSupported] = useState(false);
	const [torchEnabled, setTorchEnabled] = useState(false);
	const [torchPending, setTorchPending] = useState(false);
	const video = useRef<HTMLVideoElement>(null);
	const [cropDragging, setCropDragging] = useState(false);
	const [liveCrop, setLiveCrop] = useState<{
		tag: PhotoTag;
		crop: CroppedFace;
	} | null>(null);
	useEffect(() => {
		if (step !== "crop" || !source || points.length !== 4) {
			setLiveCrop(null);
			return;
		}
		if (cropDragging || busy || detection === "detecting") return;
		const frame = requestAnimationFrame(() => {
			try {
				setLiveCrop({
					tag: photos.find((p) => p.id === activePhoto)?.tag ?? face,
					crop: cropPerspective(source, points),
				});
			} catch {
				setLiveCrop(null);
			}
		});
		return () => cancelAnimationFrame(frame);
	}, [
		source,
		points,
		step,
		cropDragging,
		busy,
		detection,
		activePhoto,
		face,
		photos,
	]);
	const fileInput = useRef<HTMLInputElement>(null);
	const uploadPart = useRef<PhotoTag | null>(null);
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
	const cancelDetection = useCallback(() => {
		detector.current?.abort();
		detector.current = null;
		setDetection("idle");
	}, []);
	const findCorners = async (image: HTMLCanvasElement) => {
		detector.current?.abort();
		const controller = new AbortController();
		detector.current = controller;
		setDetection("detecting");
		try {
			const detected = await detectPhotoCorners(image, controller.signal);
			if (!mounted.current || controller.signal.aborted) return;
			if (detected) setPoints(detected);
			setDetection(detected ? "found" : "missed");
		} catch {
			if (mounted.current && !controller.signal.aborted) setDetection("missed");
		} finally {
			if (detector.current === controller) detector.current = null;
		}
	};
	const changePoints = (next: Point[]) => {
		cancelDetection();
		setPoints(next);
	};
	const prepareCrop = (image: HTMLCanvasElement) => {
		setCropDragging(false);
		cancelDetection();
		setSource(image);
		setPoints([]);
		setStep("crop");
		if (model === "corners") void findCorners(image);
	};
	const changeModel = (next: ScannerModel) => {
		if (next === model) return;
		cancelDetection();
		setModel(next);
		saveScannerModel(next);
		if (next === "corners" && step === "crop" && source)
			void findCorners(source);
	};
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
			detector.current?.abort();
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
		cancelDetection();
		stopCamera();
		onClose();
	};
	const back = () => {
		if (busy) return;
		cancelDetection();
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
		cancelDetection();
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
	}, [session, cancelDetection]);
	// BookScanner only mounts after the user presses Scan or Add a book.
	// getUserMedia itself asks for permission when the browser needs it.
	useEffect(() => {
		void startCamera();
	}, [startCamera]);

	const selectPhoto = async (photo: ScanPhoto) => {
		setLiveCrop(null);
		setActivePhoto(photo.id);
		if (photo.tag === "front" || photo.tag === "spine" || photo.tag === "back")
			setFace(photo.tag);
		const revision = ++loadingRevision.current;
		cancelDetection();
		stopCamera();
		setBusy(true);
		setError("");
		try {
			const image = new Image();
			image.src = photo.image;
			await image.decode();
			if (!mounted.current || revision !== loadingRevision.current) return;
			prepareCrop(imageCanvas(image, image.naturalWidth, image.naturalHeight));
			if (photo.points) {
				cancelDetection();
				setPoints(photo.points);
			}
		} catch {
			setError("Could not open this photo. Try another image.");
		} finally {
			if (mounted.current && revision === loadingRevision.current)
				setBusy(false);
		}
	};
	const importPhotos = async (files: File[]) => {
		const targetPart = uploadPart.current;
		uploadPart.current = null;
		const images = files.filter((file) => file.type.startsWith("image/"));
		if (!images.length) {
			setError("Choose images of your book.");
			return;
		}
		setBusy(true);
		try {
			const added: ScanPhoto[] = [];
			for (const file of images)
				added.push({
					id: crypto.randomUUID(),
					name: file.name,
					image: await photoData(file),
					tag:
						targetPart && added.length === 0
							? targetPart
							: photos.length + added.length === 0
								? "front"
								: "page",
				});
			if (!mounted.current) return;
			setPhotos((current) => [...current, ...added]);
			await selectPhoto(added[0]);
		} catch {
			setError("Could not import these photos. Please try again.");
		} finally {
			if (mounted.current) setBusy(false);
		}
	};
	const switchDraft = (draft: ScanDraft) => {
		++loadingRevision.current;
		cancelDetection();
		stopCamera();
		const currentDraft: ScanDraft = {
			id: draftId,
			title,
			subtitle,
			author,
			photos,
			faces,
			enrichment: {
				...enrichment,
				status:
					enrichment.status === "searching" ? "partial" : enrichment.status,
				activeStep: null,
			},
			updated: Date.now(),
		};
		setHistory((current) => [
			currentDraft,
			...current.filter((item) => item.id !== currentDraft.id),
		]);
		void saveDraft(currentDraft).catch(() => setStorageError(true));
		setDraftId(draft.id);
		setTitle(draft.title);
		setSubtitle(draft.subtitle ?? "");
		setAuthor(draft.author ?? "");
		setPhotos(draft.photos);
		setFaces(draft.faces);
		setEnrichment(draft.enrichment ?? {});
		setActivePhoto(null);
		setSource(null);
		setPoints([]);
		crops.current = {};
		setFace("front");
		setError("");
		setStep(draft.faces.front ? "review" : "unavailable");
	};
	const tagPhoto = (tag: PhotoTag) => {
		const photo = photos.find((p) => p.id === activePhoto);
		if (!photo) return;
		setPhotos((current) =>
			current.map((p) =>
				p.id === activePhoto
					? { ...p, tag }
					: ["front", "spine", "back"].includes(tag) && p.tag === tag
						? { ...p, tag: "other" }
						: p,
			),
		);
		setFaces((current) => {
			const next = { ...current };
			if (
				(photo.tag === "front" ||
					photo.tag === "spine" ||
					photo.tag === "back") &&
				next[photo.tag]?.image === photo.crop?.image
			)
				delete next[photo.tag];
			if ((tag === "front" || tag === "spine" || tag === "back") && photo.crop)
				next[tag] = photo.crop;
			return next;
		});
		if (tag === "front" || tag === "spine" || tag === "back") setFace(tag);
	};
	const capture = () => {
		setActivePhoto(null);
		if (!video.current || !cameraReady || !video.current.videoWidth) return;
		try {
			prepareCrop(
				imageCanvas(
					video.current,
					video.current.videoWidth,
					video.current.videoHeight,
				),
			);
			stopCamera();
			setError("");
		} catch {
			setError("Couldn’t capture this frame. Please try again.");
		}
	};
	const crop = async () => {
		if (!source || points.length !== 4 || busy || detection === "detecting")
			return;
		cancelDetection();
		setBusy(true);
		setError("");
		// Paint the busy state before doing GPU work.
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
		);
		if (!mounted.current) return;
		try {
			const result = cropPerspective(source, points);
			const photo = photos.find((p) => p.id === activePhoto);
			const tag = photo?.tag ?? face;
			if (tag === "front" || tag === "spine" || tag === "back") {
				crops.current[tag] = { source, points };
				setFaces((current) => ({ ...current, [tag]: result }));
			}
			if (photo)
				setPhotos((current) =>
					current.map((p) =>
						p.id === photo.id
							? {
									...p,
									image: source.toDataURL("image/jpeg", 0.92),
									crop: result,
									points,
								}
							: p,
					),
				);
			else {
				const id = crypto.randomUUID();
				setPhotos((current) => [
					...current,
					{
						id,
						name: "Camera photo",
						image: source.toDataURL("image/jpeg", 0.92),
						tag,
						crop: result,
						points,
					},
				]);
				setActivePhoto(id);
			}

			setStep(
				faces.front ||
					(photos.find((p) => p.id === activePhoto)?.tag ?? face) === "front"
					? "review"
					: "crop",
			);
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
			await saveDraft({
				id: draftId,
				title,
				subtitle,
				author,
				photos,
				faces,
				enrichment,
				updated: Date.now(),
			}).catch(() => setStorageError(true));
			await onAdd({
				id: draftId,
				photos,
				title: title.trim(),
				subtitle: subtitle.trim(),
				author: author.trim() || enrichment.author || "",
				front: faces.front,
				spine: faces.spine,
				back: faces.back,
				enrichment,
				size: {
					...size,
					source: sizeEntry?.overridden
						? "Adjusted in scanner"
						: (sizeEntry?.source ?? "Default estimate"),
				},
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
			<ImagePlus size={17} /> Camera roll · Add photos
		</button>
	);
	const progressDrafts = [
		{
			id: draftId,
			title,
			subtitle,
			author,
			photos,
			faces,
			enrichment,
			updated: Date.now(),
		},
		...history.filter((draft) => draft.id !== draftId),
	];
	const handlePart = (tag: PhotoTag) => {
		if (activePhoto) {
			tagPhoto(tag);
			return;
		}
		const photo = photos.find((p) => p.tag === tag);
		if (photo) {
			void selectPhoto(photo);
			return;
		}
		uploadPart.current = tag;
		if (tag === "front" || tag === "spine" || tag === "back") setFace(tag);
		fileInput.current?.click();
	};

	return (
		<section
			id="book-scanner"
			data-step={step}
			data-model={model}
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
				if (!busy) void importPhotos(Array.from(event.dataTransfer.files));
			}}
		>
			<input
				ref={fileInput}
				type="file"
				accept="image/*"
				multiple
				hidden
				onChange={(event) => {
					const files = Array.from(event.target.files ?? []);
					event.target.value = "";
					if (files.length) void importPhotos(files);
				}}
			/>
			<ScanProgress
				key={draftId}
				draft={progressDrafts[0]}
				enrichment={enrichment}
				dimensions={
					sizeEntry
						? `${formatMeasurement(size.height, unit)} × ${formatMeasurement(size.width, unit)} × ${formatMeasurement(size.thickness, unit)}`
						: undefined
				}
				earlier={progressDrafts.slice(1)}
				busy={busy || !draftsReady}
				onSelectDraft={switchDraft}
				onNewDraft={() => switchDraft(newScanDraft())}
				onPart={handlePart}
			/>
			<ScannerBookForm
				preview={liveCrop}
				title={title}
				onTitle={setTitle}
				photos={photos}
				faces={faces}
				activePhoto={activePhoto}
				busy={busy}
				size={size}
				unit={unit}
				onSize={writeSize}
				setUnit={setUnit}
				sizeSource={sizeEntry?.source ?? "Default estimate"}
				sizeOverridden={sizeEntry?.overridden ?? false}
				onResetSize={() => resetSize(draftId)}
				onPart={handlePart}
			>
				<label className="scan-book-name">
					Subtitle
					<input
						value={subtitle}
						maxLength={300}
						disabled={busy}
						onChange={(event) => setSubtitle(event.target.value)}
					/>
				</label>
				<label className="scan-book-name">
					Author
					<input
						value={author}
						maxLength={300}
						disabled={busy}
						onChange={(event) => setAuthor(event.target.value)}
					/>
				</label>
				<section className="scan-camera-roll" aria-label="Camera roll">
					<button
						type="button"
						disabled={busy}
						onClick={() => fileInput.current?.click()}
					>
						<ImagePlus size={20} /> Add photos
					</button>
					{photos.map((photo, i) => (
						<button
							type="button"
							key={photo.id}
							disabled={busy}
							aria-pressed={activePhoto === photo.id}
							onClick={() => void selectPhoto(photo)}
						>
							<img src={photo.crop?.image ?? photo.image} alt={photo.name} />
							<span>
								{i + 1} · {photoTags[photo.tag]}
							</span>
							{photo.crop && <Check size={12} />}
						</button>
					))}
				</section>

				{storageError && (
					<output>
						Device storage unavailable. Keep this scanner open to retain your
						drafts.
					</output>
				)}
			</ScannerBookForm>
			<header className="scan-header">
				<ScannerModelSelect
					value={model}
					onChange={changeModel}
					disabled={busy}
				/>
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
									: model === "corners"
										? "Keep all four corners visible. We’ll find them after capture."
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
						<p aria-live="polite">
							{detection === "detecting"
								? "Finding the four corners of your book…"
								: detection === "found"
									? "Corners detected. Drag the dots to fine-tune your crop."
									: detection === "missed"
										? points.length === 4
											? "No clear outline found. Your crop is kept — adjust the dots as needed."
											: "No clear outline found. Tap the corners clockwise from the top left."
										: points.length === 4
											? "Drag the corners to fine-tune your crop."
											: `Tap corner ${points.length + 1}: ${cornerNames[points.length].toLowerCase()}. Continue clockwise.`}
						</p>
						{model === "corners" && (
							<button
								type="button"
								className="scan-detect-button"
								disabled={busy || detection === "detecting"}
								onClick={() => void findCorners(source)}
							>
								{detection === "detecting" ? (
									<LoaderCircle size={13} className="scan-spin" />
								) : (
									<ScanLine size={13} />
								)}
								{detection === "detecting"
									? "Finding corners…"
									: "Detect corners again"}
							</button>
						)}
					</div>
					<div className="scan-crop-workspace">
						<CropCanvas
							source={source}
							points={points}
							onChange={changePoints}
							onInteractionChange={setCropDragging}
							disabled={busy}
						/>
						<span className="scan-crop-count">{points.length} / 4 corners</span>
					</div>
					<div className="scan-crop-tools">
						<button
							type="button"
							className="scan-icon"
							aria-label="Rotate photo left"
							disabled={busy}
							onClick={() => {
								prepareCrop(rotatePhoto(source, false));
							}}
						>
							<RotateCcw size={18} />
						</button>
						<button
							type="button"
							className="scan-text-button"
							disabled={busy}
							onClick={() => changePoints([])}
						>
							Reset
						</button>
						<button
							type="button"
							className="scan-text-button"
							disabled={busy}
							onClick={() =>
								changePoints([
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
							disabled={busy}
							onClick={() => {
								prepareCrop(rotatePhoto(source, true));
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
							disabled={
								busy || detection === "detecting" || points.length !== 4
							}
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
					<div className="scan-review-controls">
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
								onClick={() => {
									const photo =
										photos.find((p) => p.id === activePhoto) ??
										photos.find((p) => p.tag === face);
									if (photo) void selectPhoto(photo);
									else if (source) setStep("crop");
								}}
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
