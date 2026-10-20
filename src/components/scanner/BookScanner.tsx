import {
	Camera,
	Check,
	ChevronLeft,
	Crop,
	Flashlight,
	FlashlightOff,
	ImagePlus,
	LoaderCircle,
	Maximize,
	Plus,
	RotateCcw,
	RotateCw,
	ScanLine,
	Undo2,
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
import ScanDetailsSheet from "./ScanDetailsSheet";
import ScannerBook3D, { ScannerBookGuide } from "./ScannerBook3D";
import ScannerBookForm, { SHOW_LIVE_BOOK } from "./ScannerBookForm";
import ScannerController, {
	type ScannerControllerAction,
} from "./ScannerController";
import PagesRoll, { type RollCurrent } from "./PagesRoll";
import ScannerModelSelect from "./ScannerModelSelect";
import ScannerOpenBook from "./ScannerOpenBook";
import ScannerPortal from "./ScannerPortal";
import ScanProgress, { ScanHistoryDock } from "./ScanProgress";
import ScanReveal, { SHOW_SCAN_REVEAL } from "./ScanReveal";
import ShelfScanQueue from "./ShelfScanQueue";
import {
	loadDrafts,
	newScanDraft,
	type PhotoTag,
	photoData,
	photoTags,
	type ScanDraft,
	type ScanPhoto,
	pagePhotos,
	saveDraft,
} from "./scanDrafts";
import {
	requestScanMetadata,
	type CoverVerdict,
	isUsableTitle,
	judgeCover,
	requestShelfScan,
	SCAN_TIMEOUT_MS,
	sampleIsFlat,
	ScanMetadataError,
	type ShelfBook,
} from "./scanMetadata";
import type { BookScan, CroppedFace } from "./scannedBook";
import {
	detectsCorners,
	enriches,
	readScannerDataMode,
	readScannerModel,
	type ScannerDataMode,
	type ScannerModel,
	saveScannerDataMode,
	saveScannerModel,
	usesGlassUI,
} from "./scannerModels";
import {
	coverRectToVideo,
	fallbackGuideRect,
	GUIDE_PORTAL_SIZE,
	PORTAL_CROP_PAD,
	PORTAL_SHAPES,
	portalCropRect,
	portalWindowRect,
} from "./scannerPortalRenderer";
import "./scanner.css";
import "./scanner-glass.css";

/**
 * Feature flag for the camera status pill ("Camera on" / "Waiting for
 * camera" / "Camera off", `.scan-live`) on the viewfinder. When false it is
 * not rendered. Set to `true` to bring it back.
 */
const SHOW_SCAN_LIVE = false;

/**
 * Feature flag for the "Detect corners again" button (`.scan-detect-button`)
 * on the crop step. Corners are already detected automatically, so it is
 * hidden. Set to `true` to bring it back.
 */
const SHOW_DETECT_BUTTON = false;

type Step = "requesting" | "camera" | "unavailable" | "crop" | "review";
type Face = "front" | "spine" | "back";

/** Steps in the small stepper: three covers, then size, then pages. */
const STEPS = [
	{ id: "front", label: "Front" },
	{ id: "spine", label: "Spine" },
	{ id: "back", label: "Back" },
	{ id: "size", label: "Size" },
	{ id: "pages", label: "Pages" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

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
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [view, setView] = useState<"cover" | "pages">("cover");
	/** The page the open book is at / the next page to scan (0-based). */
	const [rollPage, setRollPage] = useState(0);
	const [shelf, setShelf] = useState<{
		image: string;
		books: ShelfBook[];
		index: number;
		loading: boolean;
		error?: string;
	} | null>(null);
	const shelfAbort = useRef<AbortController | null>(null);
	const shelfInput = useRef<HTMLInputElement>(null);
	const [model, setModel] = useState(readScannerModel);
	const [dataMode, setDataMode] = useState(readScannerDataMode);
	const lookups = enriches(model, dataMode);
	const privateOnly = dataMode === "private";
	// 0.4 "UI": full-screen glass theme with fewer, larger controls.
	const glass = usesGlassUI(model);

	const unit = useBookSizeStore((state) => state.unit);
	const sizeEntry = useBookSizeStore((state) => state.entries[draftId]);
	const applyEnrichmentSize = useBookSizeStore(
		(state) => state.applyEnrichment,
	);
	const editSize = useBookSizeStore((state) => state.setSize);
	const resetSize = useBookSizeStore((state) => state.reset);
	const confirmSize = useBookSizeStore((state) => state.confirm);
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
		// Never search the catalogues for a placeholder or a half-typed letter.
		if (!isUsableTitle(cleanTitle) || !draftsReady || !lookups) return;
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
				// Private mode: local catalog + on-device barcode only; no network.
				fetcher: privateOnly
					? () => Promise.reject(new Error("Private mode: lookups disabled"))
					: undefined,
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
							update.physicalSize.thicknessCm !== undefined,
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
							false,
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
		lookups,
		privateOnly,
	]);

	const writeSize = (
		axis: keyof typeof DEFAULT_BOOK_SIZE_CM,
		value: number,
	) => {
		editSize(draftId, { [axis]: value });
		setEnrichment((current) => ({ ...current, dimensionsOverridden: true }));
	};

	// Read title/author from the front cover in the background; only fills
	// fields the user left empty. Progress shows in the read-out under the stepper.
	// The verdict says what the reader found: a clean title, a title it is not
	// sure of, no title, or "this is not a book cover" (see judgeCover).
	const [coverRead, setCoverRead] = useState<
		"idle" | "reading" | "done" | "failed"
	>("idle");
	const [coverVerdict, setCoverVerdict] = useState<CoverVerdict>({
		kind: "ok",
	});
	// Bump to run the cover read again (the "Try again" button).
	const [coverReadRetry, setCoverReadRetry] = useState(0);
	const frontImage = faces.front?.image;
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run only when the cover or draft changes, not on every keystroke.
	useEffect(() => {
		// The cover read is the first AI step, so it runs on every scanner version
		// (not just 0.3) whenever the data mode allows the network (Online).
		if (!frontImage || !draftsReady || dataMode !== "online") {
			setCoverRead("idle");
			return;
		}
		const controller = new AbortController();
		// Set only when the effect is torn down (new cover, draft switch, unmount).
		// The 30 s timeout also aborts the request, but must still clear the UI.
		let cancelled = false;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const timer = setTimeout(() => {
			setCoverRead("reading");
			setCoverVerdict({ kind: "ok" });
			setEnrichment((current) => ({
				...current,
				status: "searching",
				activeStep: current.activeStep ?? "Title",
			}));
			timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
			// One retry for a network blip, rate limit or server error; a bad
			// photo (400/413) or a cancel is not retried.
			const readCover = async () => {
				for (let attempt = 0; ; attempt++) {
					try {
						return await requestScanMetadata(frontImage, controller.signal);
					} catch (cause) {
						const status =
							cause instanceof ScanMetadataError ? cause.status : 0;
						const retry =
							attempt < 1 &&
							!cancelled &&
							!controller.signal.aborted &&
							(status === 0 || status === 429 || status >= 500);
						if (!retry) throw cause;
						await new Promise((resolve) => setTimeout(resolve, 1500));
						if (cancelled || controller.signal.aborted) throw cause;
					}
				}
			};
			let failed = false;
			void readCover()
				.then(async (metadata) => {
					if (cancelled) return;
					// A blank photo is worth telling apart from a cover with no text.
					const flat = isUsableTitle(metadata.title)
						? false
						: await sampleIsFlat(frontImage);
					if (cancelled) return;
					const verdict = judgeCover(metadata, flat);
					setCoverVerdict(verdict);
					// Fill only what the reader is reasonably sure of. A title it is
					// unsure of is still filled (you can fix it) but flagged.
					if (verdict.kind === "ok" || verdict.kind === "check") {
						setTitle((v) => v.trim() || metadata.title);
						if (metadata.subtitle)
							setSubtitle((v) => v.trim() || metadata.subtitle);
						if (metadata.author) setAuthor((v) => v.trim() || metadata.author);
					}
				})
				.catch(() => {
					/* Manual entry still works when the cover reader is unavailable. */
					failed = true;
				})
				.finally(() => {
					if (cancelled) return;
					setCoverRead(failed ? "failed" : "done");
					setEnrichment((current) =>
						current.activeStep === "Title"
							? {
									...current,
									activeStep: null,
									// Don't leave "searching" up after a failed read.
									status: failed ? "partial" : current.status,
								}
							: current,
					);
				});
		}, 600);
		return () => {
			cancelled = true;
			clearTimeout(timer);
			if (timeout) clearTimeout(timeout);
			controller.abort();
		};
	}, [frontImage, draftId, draftsReady, dataMode, coverReadRetry]);

	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
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
	const lastLiveCrop = useRef(0);
	const [liveCrop, setLiveCrop] = useState<{
		tag: PhotoTag;
		crop: CroppedFace;
	} | null>(null);
	useEffect(() => {
		if (step !== "crop" || !source || points.length !== 4) {
			setLiveCrop(null);
			return;
		}
		if (busy || detection === "detecting") return;
		// A small, fast preview that follows the corners while they are dragged
		// (throttled); the full-size crop is made when you press Crop.
		const run = () => {
			lastLiveCrop.current = performance.now();
			try {
				setLiveCrop({
					// A page being shot has no cover face: tag it as the page.
					tag:
						photos.find((p) => p.id === activePhoto)?.tag ??
						captureTag.current ??
						face,
					crop: cropPerspective(source, points, 640),
				});
			} catch {
				setLiveCrop(null);
			}
		};
		// At most one preview every 80ms while dragging, always ending on the
		// final corner positions.
		const wait = cropDragging
			? Math.max(0, lastLiveCrop.current + 80 - performance.now())
			: 0;
		const timer = window.setTimeout(run, wait);
		return () => window.clearTimeout(timer);
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
	const uploadPage = useRef<number | null>(null);
	/** Tag for the next camera capture when it isn't a cover face (e.g. a page). */
	const captureTag = useRef<PhotoTag | null>(null);
	/** True while scanning pages one after another: each crop reopens the camera. */
	const pageSession = useRef(false);
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
		// Start with the whole image selected, then let auto detect tighten it.
		// If nothing is found, these four points stay as the crop.
		setPoints([
			{ x: 0, y: 0 },
			{ x: image.width, y: 0 },
			{ x: image.width, y: image.height },
			{ x: 0, y: image.height },
		]);
		setStep("crop");
		if (detectsCorners(model)) void findCorners(image);
	};
	const changeModel = (next: ScannerModel) => {
		if (next === model) return;
		cancelDetection();
		setModel(next);
		saveScannerModel(next);
		if (detectsCorners(next) && step === "crop" && source)
			void findCorners(source);
	};
	const changeDataMode = (next: ScannerDataMode) => {
		setDataMode(next);
		saveScannerDataMode(next);
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
		// Escape while scanning pages ends the page run, not the whole scanner.
		if (pageSession.current && step !== "review") {
			donePages();
			return;
		}
		cancelDetection();
		setError("");
		stopCamera();
		if (step === "review") {
			// Steps are open without any photo, so there may be nothing to crop.
			if (source) setStep("crop");
			else void startCamera();
		} else if (step === "crop" && faces.front) {
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
		const targetPage = uploadPage.current;
		uploadPage.current = null;
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
					page:
						targetPage !== null && targetPart === "page"
							? targetPage + added.length
							: undefined,
				});
			if (!mounted.current) return;
			const replaced = new Set(
				added.flatMap((photo) =>
					photo.page === undefined ? [] : [photo.page],
				),
			);
			setPhotos((current) => [
				// A rescan replaces the earlier photo of that page.
				...current.filter((p) => p.page === undefined || !replaced.has(p.page)),
				...added,
			]);
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
			const { videoWidth, videoHeight } = video.current;
			// Rough crop: keep what the portal window shows (plus a little margin),
			// so corner detection and your fine crop start from the book, not the
			// whole frame. Without WebGL the window isn't drawn, so keep it all.
			const portalFace = captureTag.current === "page" ? "page" : face;
			// 0.4: the camera fills the screen and the portal is only a guide, so
			// keep exactly what is inside the guide, nothing from around it.
			const viewWidth = video.current.clientWidth;
			const viewHeight = video.current.clientHeight;
			const region = glass
				? coverRectToVideo(
						portalFallback
							? fallbackGuideRect(
									viewWidth,
									viewHeight,
									portalFace,
									GUIDE_PORTAL_SIZE,
								)
							: portalWindowRect(
									viewWidth,
									viewHeight,
									PORTAL_SHAPES[portalFace],
									GUIDE_PORTAL_SIZE,
								),
						viewWidth,
						viewHeight,
						videoWidth,
						videoHeight,
					)
				: portalFallback
					? undefined
					: portalCropRect(
							videoWidth,
							videoHeight,
							PORTAL_SHAPES[portalFace],
							PORTAL_CROP_PAD,
						);
			prepareCrop(imageCanvas(video.current, videoWidth, videoHeight, region));
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
			const tag = photo?.tag ?? captureTag.current ?? face;
			captureTag.current = null;
			const isCover = tag === "front" || tag === "spine" || tag === "back";
			// The page this crop belongs to (for "scan the next page").
			let donePage: number | undefined = photo?.page;
			if (tag === "front" || tag === "spine" || tag === "back") {
				crops.current[tag] = { source, points };
				setFaces((current) => ({ ...current, [tag]: result }));
				// Line up the next capture: front → spine → back.
				const next = (["front", "spine", "back"] as const).find(
					(candidate) => candidate !== tag && !faces[candidate],
				);
				if (next) setFace(next);
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
				const pageIndex = tag === "page" ? uploadPage.current : null;
				uploadPage.current = null;
				donePage = pageIndex ?? undefined;
				setPhotos((current) => [
					// A rescan replaces the earlier photo of that page.
					...current.filter((p) => pageIndex === null || p.page !== pageIndex),
					{
						id,
						name: "Camera photo",
						image: source.toDataURL("image/jpeg", 0.92),
						tag,
						crop: result,
						points,
						page: pageIndex ?? undefined,
					},
				]);
				setActivePhoto(id);
			}

			// The open book moves on to the page after the one just scanned.
			if (!isCover && donePage !== undefined) setRollPage(donePage + 1);

			// After a cover, reopen the camera for the next one that's still
			// missing (front → spine → back). Once they're in, go to review.
			const coverOrder: Face[] = ["front", "spine", "back"];
			const nextCover =
				tag === "front" || tag === "spine" || tag === "back"
					? coverOrder
							.slice(coverOrder.indexOf(tag) + 1)
							.find((candidate) => !faces[candidate])
					: undefined;
			if (nextCover) {
				setFace(nextCover);
				setActivePhoto(null);
				void startCamera();
			} else if (!isCover && pageSession.current) {
				// Pages go on and on: straight back to the camera for the next
				// one. The little book opens at it with the page just scanned
				// lying beside it. "Done" returns to the book.
				uploadPart.current = "page";
				uploadPage.current = (donePage ?? pagePhotoCount) + 1;
				captureTag.current = "page";
				setActivePhoto(null);
				setLiveCrop(null);
				void startCamera();
			} else {
				// All covers done: carry on to step 4, the size. A scanned page
				// returns to the book it came from (steps are open in any order).
				if (tag === "front" || tag === "spine" || tag === "back")
					setView("cover");
				setStep("review");
			}
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Couldn’t crop this photo.",
			);
		} finally {
			setBusy(false);
		}
	};
	const add = async () => {
		if (adding.current) return;
		// Guardrails: say what is missing instead of doing nothing.
		if (!faces.front) {
			setError("Scan the front cover first, then add the book.");
			goToStep("front");
			return;
		}
		if (!isUsableTitle(title)) {
			setError("Give the book a title first.");
			setView("cover");
			setDetailsOpen(true);
			return;
		}
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
	const upload = (
		<button
			type="button"
			className="scan-rail-btn"
			disabled={busy}
			onClick={() => {
				// A photo picked here belongs to the cover we're asking for.
				if (captureTag.current !== "page") uploadPart.current = face;
				fileInput.current?.click();
			}}
		>
			<span className="scan-rail-icon">
				<ImagePlus size={20} />
			</span>
			<span>Camera roll</span>
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
	const pageCount = Math.max(
		enrichment.pageCount ?? 0,
		...photos.map((photo) => (photo.page ?? -1) + 1),
		photos.filter((photo) => photo.tag === "page").length,
	);
	const pagePhotoCount = pagePhotos(photos).size;
	/** Review shows Size ("cover" view) or Pages; before that, the cover being shot. */
	const activeTag = photos.find((p) => p.id === activePhoto)?.tag;
	const shootingPage =
		captureTag.current === "page" ||
		Boolean(
			activeTag &&
				activeTag !== "front" &&
				activeTag !== "spine" &&
				activeTag !== "back",
		);
	const currentStepId: StepId =
		step === "review"
			? view === "pages"
				? "pages"
				: "size"
			: shootingPage
				? "pages"
				: face;
	const showStepper = !shelf;
	// Small live book in the bottom-left corner: a guide that turns to the cover
	// being shot (front → spine → back) and fills in as each crop is accepted.
	// The Size step shows the big book instead.
	// While scanning a page it shows the book open at that page instead.
	const showGuide = !shelf && !detailsOpen && step !== "review";
	const guideSide: Face = face;
	const activePageIndex = photos.find((p) => p.id === activePhoto)?.page;
	const guidePage = shootingPage
		? (uploadPage.current ?? activePageIndex ?? pagePhotoCount)
		: undefined;
	const livePageCrop =
		shootingPage &&
		guidePage !== undefined &&
		liveCrop &&
		liveCrop.tag !== "front" &&
		liveCrop.tag !== "spine" &&
		liveCrop.tag !== "back"
			? liveCrop.crop
			: undefined;
	// The page being cropped shows on its leaf before you accept it.
	const guidePhotos: ScanPhoto[] =
		livePageCrop && guidePage !== undefined
			? [
					...photos,
					{
						id: "live-page",
						name: "Live crop",
						image: livePageCrop.image,
						tag: "page",
						page: guidePage,
					},
				]
			: photos;
	const guideFaces: Partial<Record<Face, CroppedFace>> =
		liveCrop &&
		(liveCrop.tag === "front" ||
			liveCrop.tag === "spine" ||
			liveCrop.tag === "back")
			? { ...faces, [liveCrop.tag]: liveCrop.crop }
			: faces;
	/** Open the details sheet so the title can be typed or fixed. */
	const typeTheTitle = () => {
		setView("cover");
		setDetailsOpen(true);
	};
	/** What the AI read from the front cover: a small chip over the book preview. */
	const coverReadChip =
		showStepper &&
		faces.front &&
		(coverRead !== "idle" || title || subtitle || author) ? (
			<output
				className="scan-cover-read"
				data-state={coverRead}
				data-verdict={isUsableTitle(title) ? coverVerdict.kind : "empty"}
			>
				{coverRead === "reading" ? (
					<>
						<LoaderCircle className="scan-spin" size={11} aria-hidden="true" />
						<span>Reading the cover…</span>
					</>
				) : coverVerdict.kind === "not-book" && coverRead !== "failed" ? (
					// Not a book cover (or a blank photo): suggest a retake first.
					<>
						<span>{coverVerdict.message}</span>
						<button type="button" onClick={() => goToStep("front")}>
							Retake the cover
						</button>
						<button type="button" onClick={typeTheTitle}>
							Type the title
						</button>
					</>
				) : isUsableTitle(title) ? (
					<>
						<strong>{title}</strong>
						{(subtitle || author) && (
							<span>{[subtitle, author].filter(Boolean).join(" · ")}</span>
						)}
						{coverVerdict.kind === "check" && (
							// Read, but the reader is not sure: show it, flagged.
							<>
								<span className="scan-cover-read-warn">
									{coverVerdict.message}
								</span>
								<button type="button" onClick={typeTheTitle}>
									Edit title
								</button>
							</>
						)}
					</>
				) : (
					// Nothing readable: say so and offer the two ways forward.
					<>
						<span>
							{coverRead === "failed"
								? "Couldn’t read the cover."
								: coverVerdict.kind === "empty"
									? coverVerdict.message
									: "No title found on this cover."}
						</span>
						<button
							type="button"
							onClick={() => setCoverReadRetry((value) => value + 1)}
						>
							Try again
						</button>
						<button type="button" onClick={typeTheTitle}>
							Type the title
						</button>
					</>
				)}
			</output>
		) : null;
	/** Stop scanning pages and show the open book, at the next empty page. */
	const donePages = () => {
		pageSession.current = false;
		captureTag.current = null;
		uploadPart.current = null;
		uploadPage.current = null;
		cancelDetection();
		stopCamera();
		setError("");
		setActivePhoto(null);
		setLiveCrop(null);
		setRollPage(Math.max(-1, ...pagePhotos(photos).keys()) + 1);
		setView("pages");
		setStep("review");
	};
	/** What the pages roll highlights: the cover or page being shot / shown. */
	const rollCurrent: RollCurrent =
		step === "review"
			? view === "pages"
				? rollPage
				: null
			: shootingPage
				? (guidePage ?? rollPage)
				: face;
	/**
	 * A page tile on the roll. While you are shooting pages it points the camera
	 * at that page; otherwise it opens the book there.
	 */
	const pickRollPage = (index: number) => {
		if (busy) return;
		setRollPage(index);
		if (step === "camera" && pageSession.current) {
			uploadPart.current = "page";
			uploadPage.current = index;
			captureTag.current = "page";
			return;
		}
		pageSession.current = false;
		captureTag.current = null;
		uploadPart.current = null;
		uploadPage.current = null;
		cancelDetection();
		stopCamera();
		setError("");
		setActivePhoto(null);
		setLiveCrop(null);
		setView("pages");
		setStep("review");
	};
	/** Jump to a cover (its saved crop, or the camera if it's missing), Size or Pages. */
	const goToStep = (target: StepId) => {
		if (busy) return;
		// Tapping Pages while shooting a page is "Done": back to the open book.
		if (target === "pages" && step !== "review" && shootingPage) {
			donePages();
			return;
		}
		if (target === currentStepId) return;
		pageSession.current = false;
		captureTag.current = null;
		uploadPage.current = null;
		cancelDetection();
		setError("");
		// Every step is always open: Size and Pages work before any cover is in.
		if (target === "size" || target === "pages") {
			stopCamera();
			setActivePhoto(null);
			setLiveCrop(null);
			setView(target === "pages" ? "pages" : "cover");
			setStep("review");
			return;
		}
		setLiveCrop(null);
		const photo =
			photos.find((p) => p.tag === target && p.crop) ??
			photos.find((p) => p.tag === target);
		if (photo) {
			void selectPhoto(photo);
			return;
		}
		setFace(target);
		setActivePhoto(null);
		if (step !== "camera" && step !== "requesting") void startCamera();
	};
	const editField = (key: keyof EnrichmentValues, value: string) => {
		if (key === "title") setTitle(value);
		else if (key === "subtitle") setSubtitle(value);
		else if (key === "author") setAuthor(value);
		setEnrichment((current) => ({ ...current, [key]: value }));
	};
	const [sizeToolsRequest, setSizeToolsRequest] = useState(0);
	// The 3D book starts micro after the first cover and grows once all three
	// covers are in (or the user skips the rest).
	const [coversSkipped, setCoversSkipped] = useState(false);
	const coverCount = [faces.front, faces.spine, faces.back].filter(
		Boolean,
	).length;
	const bookPreviewSize: "micro" | "full" =
		coverCount >= 3 || coversSkipped ? "full" : "micro";
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new book starts micro again.
	useEffect(() => setCoversSkipped(false), [draftId]);
	/** Shelf scan: one photo → the AI lists the books → we walk them one at a time. */
	const startShelfScan = async (file: File) => {
		shelfAbort.current?.abort();
		const controller = new AbortController();
		shelfAbort.current = controller;
		stopCamera();
		const image = await photoData(file);
		if (!mounted.current) return;
		setShelf({ image, books: [], index: 0, loading: true });
		try {
			const books = await requestShelfScan(image, controller.signal);
			if (!mounted.current || controller.signal.aborted) return;
			setShelf({ image, books, index: 0, loading: false });
		} catch (cause) {
			if (!mounted.current || controller.signal.aborted) return;
			setShelf({
				image,
				books: [],
				index: 0,
				loading: false,
				error:
					cause instanceof Error && cause.name === "ScanMetadataError"
						? cause.message
						: "The shelf reader is unavailable right now.",
			});
		}
	};
	const acceptShelfBook = (book: ShelfBook) => {
		// Each accepted book becomes its own draft, prefilled from the shelf.
		const draft = newScanDraft();
		switchDraft({
			...draft,
			title: book.title,
			subtitle: book.subtitle,
			author: book.author,
		});
		setShelf((current) =>
			current ? { ...current, index: current.index + 1 } : current,
		);
	};
	const skipShelfBook = () =>
		setShelf((current) =>
			current ? { ...current, index: current.index + 1 } : current,
		);
	const closeShelfScan = () => {
		shelfAbort.current?.abort();
		setShelf(null);
	};
	useEffect(() => () => shelfAbort.current?.abort(), []);
	const controllerAction = (id: ScannerControllerAction) => {
		// Jumping elsewhere ends a run of page scans (Pages itself is "Done").
		if (id === "pages" && step !== "review" && shootingPage) {
			donePages();
			return;
		}
		if (id !== "capture" && id !== "roll" && id !== "details")
			pageSession.current = false;
		switch (id) {
			case "capture":
				if (step === "camera" && cameraReady) capture();
				else if (step === "unavailable") fileInput.current?.click();
				else void startCamera();
				break;
			case "roll":
				fileInput.current?.click();
				break;
			case "cover":
				setView("cover");
				if (step !== "review") {
					stopCamera();
					setStep("review");
				}
				break;
			case "pages":
				setView("pages");
				if (step !== "review") {
					stopCamera();
					setStep("review");
				}
				break;
			case "details":
				setDetailsOpen((value) => !value);
				break;
			case "size":
				setView("cover");
				if (step !== "review") {
					stopCamera();
					setStep("review");
				}
				setSizeToolsRequest((value) => value + 1);
				break;
			case "new":
				switchDraft(newScanDraft());
				break;
			case "shelf":
				close();
				break;
		}
	};
	/** Scan one inside page: camera when possible, otherwise the photo picker. */
	const scanPage = (index: number) => {
		pageSession.current = true;
		uploadPart.current = "page";
		uploadPage.current = index;
		captureTag.current = "page";
		setActivePhoto(null);
		if (step === "unavailable") {
			fileInput.current?.click();
			return;
		}
		void startCamera();
	};
	const revealEnrichment: EnrichmentValues = {
		...enrichment,
		title: title.trim() || enrichment.title,
		subtitle: subtitle.trim() || enrichment.subtitle,
		author: author.trim() || enrichment.author,
	};

	return (
		<section
			id="book-scanner"
			data-step={step}
			data-stepper={showStepper || undefined}
			data-model={model}
			data-ui={glass ? "glass" : undefined}
			data-face={face}
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
			<input
				ref={shelfInput}
				type="file"
				accept="image/*"
				capture="environment"
				hidden
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file) void startShelfScan(file);
				}}
			/>
			<header className="scan-header">
				<div className="scan-brand-group">
					<button
						type="button"
						className="scan-brand"
						aria-label="Close scanner and go to the shelf"
						disabled={busy}
						onClick={close}
					>
						<img
							src={`${import.meta.env.BASE_URL}icons/wordmark-gradient.svg`}
							alt="Boooks"
						/>
					</button>
					<ScannerModelSelect
						value={model}
						onChange={changeModel}
						mode={dataMode}
						onModeChange={changeDataMode}
						onScanShelf={() => shelfInput.current?.click()}
						disabled={busy}
					/>
				</div>
				{glass ? (
					// 0.4: one step back (crop → camera, review → crop…); from the
					// first camera step it returns to the shelf. Same as Escape.
					<button
						type="button"
						className="scan-icon scan-back"
						aria-label="Back"
						title="Back"
						disabled={busy}
						onClick={back}
					>
						<ChevronLeft size={21} />
					</button>
				) : (
					<button
						type="button"
						className="scan-icon scan-close"
						aria-label="Close scanner and explore shelf"
						disabled={busy}
						onClick={close}
					>
						<X size={19} />
					</button>
				)}
			</header>
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
			<ScanHistoryDock
				current={progressDrafts[0]}
				currentEnrichment={enrichment}
				earlier={progressDrafts.slice(1)}
				busy={busy || !draftsReady}
				onSelectDraft={switchDraft}
				onNewDraft={() => switchDraft(newScanDraft())}
			/>
			{showGuide && (
				<figure
					className="scan-book-guide"
					data-open={guidePage !== undefined || undefined}
					aria-label={`Book preview: ${guideSide}`}
				>
					<ScannerBookGuide
						faces={guideFaces}
						side={guideSide}
						size={size}
						pages={pageCount || 180}
						photos={guidePhotos}
						page={guidePage}
					/>
					{coverReadChip}
					<figcaption>
						{guidePage === undefined
							? photoTags[guideSide]
							: `Page ${guidePage + 1}`}
					</figcaption>
				</figure>
			)}
			<div className="scan-main">
				{SHOW_SCAN_REVEAL && !detailsOpen && (
					<ScanReveal
						draftId={draftId}
						enrichment={revealEnrichment}
						onEdit={editField}
						onOpenAll={() => setDetailsOpen(true)}
					/>
				)}
				{detailsOpen && (
					<ScanDetailsSheet
						enrichment={revealEnrichment}
						onEdit={editField}
						onClose={() => setDetailsOpen(false)}
					/>
				)}
				{showStepper && (
					<nav className="scan-cover-stepper" aria-label="Book steps">
						{STEPS.map(({ id, label }, index) => {
							const complete =
								id === "size"
									? Boolean(sizeEntry?.confident || sizeEntry?.overridden)
									: id === "pages"
										? pagePhotoCount > 0
										: Boolean(faces[id]);
							return (
								<button
									key={id}
									type="button"
									className={complete ? "is-done" : undefined}
									aria-current={id === currentStepId ? "step" : undefined}
									disabled={busy}
									onClick={() => goToStep(id)}
								>
									<i>
										{complete ? (
											<Check size={11} aria-hidden="true" />
										) : (
											index + 1
										)}
									</i>
									{label}
									{id === "pages" && pagePhotoCount > 0 && (
										<small>
											{pagePhotoCount}/{pageCount || "?"}
										</small>
									)}
								</button>
							);
						})}
					</nav>
				)}
				{showStepper && !glass && (
					<PagesRoll
						faces={faces}
						pages={pagePhotos(photos)}
						total={pageCount}
						current={rollCurrent}
						busy={busy}
						onCover={goToStep}
						onPage={pickRollPage}
					/>
				)}
				{shelf ? (
					<ShelfScanQueue
						image={shelf.image}
						books={shelf.books}
						index={shelf.index}
						loading={shelf.loading}
						error={shelf.error}
						onAccept={acceptShelfBook}
						onSkip={skipShelfBook}
						onClose={closeShelfScan}
					/>
				) : step === "review" && view === "pages" ? (
					<ScannerOpenBook
						key={`open-book-${draftId}`}
						size={size}
						pages={pageCount || 180}
						photos={photos}
						faces={{
							front: faces.front?.image,
							back: faces.back?.image,
							spine: faces.spine?.image,
						}}
						busy={busy}
						current={rollPage}
						onCurrent={setRollPage}
						onScanPage={scanPage}
					/>
				) : step === "review" && !SHOW_LIVE_BOOK ? (
					<section className="scan-size-step" aria-label="Book size">
						<ScannerBook3D
							faces={faces}
							side="front"
							onPart={handlePart}
							size={size}
							unit={unit}
							setUnit={setUnit}
							onSize={writeSize}
							source={sizeEntry?.source ?? "Default estimate"}
							overridden={sizeEntry?.overridden ?? false}
							confident={sizeEntry?.confident ?? false}
							onConfirm={() => confirmSize(draftId)}
							toolsRequest={sizeToolsRequest}
							reset={() => resetSize(draftId)}
							startEditing
							openBook={{ pages: pageCount || 180, photos }}
						/>
					</section>
				) : (
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
						sizeConfident={sizeEntry?.confident ?? false}
						onConfirmSize={() => confirmSize(draftId)}
						sizeToolsRequest={sizeToolsRequest}
						onResetSize={() => resetSize(draftId)}
						onPart={handlePart}
						bookSize={bookPreviewSize}
						onSkipCovers={() => setCoversSkipped(true)}
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
						<details className="scan-roll-details" open={photos.length <= 3}>
							<summary>
								<ImagePlus size={15} aria-hidden="true" />
								Camera roll
								<small>
									{photos.length} photo{photos.length === 1 ? "" : "s"}
								</small>
							</summary>
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
										<img
											src={photo.crop?.image ?? photo.image}
											alt={photo.name}
										/>
										<span>
											{i + 1} · {photoTags[photo.tag]}
										</span>
										{photo.crop && <Check size={12} />}
									</button>
								))}
							</section>
						</details>

						{storageError && (
							<output>
								Device storage unavailable. Keep this scanner open to retain
								your drafts.
							</output>
						)}
					</ScannerBookForm>
				)}
				{(step === "camera" ||
					step === "requesting" ||
					step === "unavailable") && (
					<div className="scan-camera-screen">
						<div className="scannerMode">
							<h1 ref={heading} tabIndex={-1}>
								{step === "requesting"
									? "Opening camera…"
									: step === "unavailable"
										? "Let’s get your camera ready."
										: captureTag.current === "page"
											? `Lay page ${(guidePage ?? 0) + 1} flat in the frame.`
											: face === "spine"
												? "Turn the book on its side."
												: face === "back"
													? "Flip to the back cover."
													: "Place the front cover in the frame."}
							</h1>
							<p>
								{step === "requesting"
									? "Allow camera access in your browser if asked."
									: step === "unavailable"
										? "Try the camera again or choose a photo below."
										: face === "spine" && captureTag.current !== "page"
											? "Line the spine up with the slot."
											: detectsCorners(model)
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
								face={captureTag.current === "page" ? "page" : face}
								onFallbackChange={setPortalFallback}
								guide={glass}
								size={glass ? GUIDE_PORTAL_SIZE : 1}
							/>
							{SHOW_SCAN_LIVE && (
								<span className="scan-live">
									<i />{" "}
									{step === "camera"
										? "Camera on"
										: step === "requesting"
											? "Waiting for camera"
											: "Camera off"}
								</span>
							)}
							{step !== "unavailable" && !cameraReady && (
								<LoaderCircle className="scan-camera-loading scan-spin" />
							)}
						</div>
						<div className="scan-camera-actions scan-rail">
							{pageSession.current && (
								<button
									type="button"
									className="scan-rail-btn is-done"
									disabled={busy}
									onClick={donePages}
								>
									<span className="scan-rail-icon">
										<Check size={20} />
									</span>
									<span>Done · {pagePhotoCount}</span>
								</button>
							)}
							{upload}
							{step === "unavailable" ? (
								<button
									type="button"
									className="scan-rail-btn is-primary"
									onClick={() => void startCamera()}
								>
									<span className="scan-rail-icon">
										<Camera size={22} />
									</span>
									<span>Try again</span>
								</button>
							) : (
								<button
									className="scan-rail-btn is-shutter"
									type="button"
									aria-label={
										captureTag.current === "page"
											? "Capture page"
											: "Capture book cover"
									}
									disabled={!cameraReady}
									onClick={capture}
								>
									<span className="scan-rail-icon">
										<span className="scan-shutter-dot" />
									</span>
									<span>Capture</span>
								</button>
							)}
							<button
								type="button"
								className="scan-rail-btn"
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
								<span className="scan-rail-icon">
									{torchPending ? (
										<LoaderCircle size={20} className="scan-spin" />
									) : torchEnabled ? (
										<Flashlight size={20} />
									) : (
										<FlashlightOff size={20} />
									)}
								</span>
								<span>{torchSupported ? "Flashlight" : "No flash"}</span>
							</button>
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
							{SHOW_DETECT_BUTTON && detectsCorners(model) && (
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
								loupe={glass ? "pointer" : "corner"}
							/>
							<span className="scan-crop-count">
								{points.length} / 4 corners
							</span>
						</div>
						<div className="scan-crop-rail scan-rail">
							<button
								type="button"
								className="scan-rail-btn is-primary"
								disabled={
									busy || detection === "detecting" || points.length !== 4
								}
								onClick={crop}
							>
								<span className="scan-rail-icon">
									{busy ? (
										<LoaderCircle className="scan-spin" size={22} />
									) : (
										<Crop size={22} />
									)}
								</span>
								<span>{busy ? "Cropping…" : "Crop"}</span>
							</button>
							<button
								type="button"
								className="scan-rail-btn"
								disabled={busy}
								onClick={() => {
									void startCamera();
								}}
							>
								<span className="scan-rail-icon">
									<Camera size={20} />
								</span>
								<span>Retake</span>
							</button>
							{!glass && (
								<button
									type="button"
									className="scan-rail-btn"
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
									<span className="scan-rail-icon">
										<Maximize size={20} />
									</span>
									<span>Full image</span>
								</button>
							)}
							{!glass && (
								<button
									type="button"
									className="scan-rail-btn"
									disabled={busy}
									onClick={() => changePoints([])}
								>
									<span className="scan-rail-icon">
										<Undo2 size={20} />
									</span>
									<span>Reset</span>
								</button>
							)}
							<div className="scan-rail-pair">
								<button
									type="button"
									className="scan-rail-btn is-small"
									aria-label="Rotate photo left"
									disabled={busy}
									onClick={() => {
										prepareCrop(rotatePhoto(source, false));
									}}
								>
									<span className="scan-rail-icon">
										<RotateCcw size={18} />
									</span>
								</button>
								<button
									type="button"
									className="scan-rail-btn is-small"
									aria-label="Rotate photo right"
									disabled={busy}
									onClick={() => {
										prepareCrop(rotatePhoto(source, true));
									}}
								>
									<span className="scan-rail-icon">
										<RotateCw size={18} />
									</span>
								</button>
							</div>
						</div>
					</div>
				)}
				{step === "review" && (
					<div className="scan-review-screen">
						<div className="scan-section-title">
							<h1 ref={heading} tabIndex={-1}>
								Ready for your shelf.
							</h1>
							<p>A real cover. A little particle magic.</p>
						</div>
						<div className="scan-review-controls scan-rail scan-rail-low">
							<button
								type="button"
								className="scan-rail-btn"
								disabled={busy}
								onClick={() => {
									const photo =
										photos.find((p) => p.id === activePhoto) ??
										photos.find((p) => p.tag === face);
									if (photo) void selectPhoto(photo);
									else if (source) setStep("crop");
									else goToStep("front");
								}}
							>
								<span className="scan-rail-icon">
									<Crop size={20} />
								</span>
								<span>Adjust crop</span>
							</button>
							<button
								type="button"
								className="scan-rail-btn is-primary"
								disabled={busy}
								onClick={add}
							>
								<span className="scan-rail-icon">
									{busy ? (
										<LoaderCircle className="scan-spin" size={22} />
									) : (
										<Plus size={22} />
									)}
								</span>
								<span>{busy ? "Adding…" : "Add to shelf"}</span>
							</button>
						</div>
					</div>
				)}
				<ScanProgress
					key={`progress-${draftId}`}
					draft={progressDrafts[0]}
					enrichment={enrichment}
					dimensions={
						sizeEntry
							? `${formatMeasurement(size.height, unit)} × ${formatMeasurement(size.width, unit)} × ${formatMeasurement(size.thickness, unit)}`
							: undefined
					}
					busy={busy || !draftsReady}
					onPart={handlePart}
					onOpenAll={() => setDetailsOpen(true)}
				/>
			</div>
			{busy && !["crop", "review"].includes(step) && (
				<output className="scan-busy">
					<LoaderCircle className="scan-spin" size={16} /> Opening photo…
				</output>
			)}
			{/* 0.4 keeps one way to move around: the stepper, header and dock. */}
			{!glass && <ScannerController onAction={controllerAction} />}
		</section>
	);
}
