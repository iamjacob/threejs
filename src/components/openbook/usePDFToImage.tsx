import { useCallback, useEffect, useMemo, useState } from "react";

const PDF_JS_URL =
	"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_WORKER_URL =
	"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const PDF_SCRIPT_ID = "pdfjs-library-script";

interface PDFProgressData {
	loaded: number;
	total?: number;
}

interface PDFViewport {
	width: number;
	height: number;
}

interface PDFRenderTask {
	promise: Promise<void>;
}

interface PDFPageProxy {
	getViewport: (options: { scale: number }) => PDFViewport;
	render: (options: {
		canvasContext: CanvasRenderingContext2D;
		viewport: PDFViewport;
	}) => PDFRenderTask;
}

interface PDFDocumentProxy {
	numPages: number;
	getPage: (pageNumber: number) => Promise<PDFPageProxy>;
}

interface PDFLoadingTask {
	promise: Promise<PDFDocumentProxy>;
	onProgress?: ((progress: PDFProgressData) => void) | null;
	destroy?: () => Promise<void> | void;
}

interface PDFJSStatic {
	GlobalWorkerOptions: {
		workerSrc: string;
	};
	getDocument: (source: { url: string }) => PDFLoadingTask;
}

declare global {
	interface Window {
		pdfjsLib?: PDFJSStatic;
	}
}

class LRUCache<Key, Value> {
	private readonly limit: number;
	private readonly cache = new Map<Key, Value>();

	constructor(limit = 28) {
		this.limit = Math.max(1, limit);
	}

	get(key: Key): Value | undefined {
		const value = this.cache.get(key);
		if (value === undefined) return undefined;

		// Move the entry to the end so it becomes the most recently used.
		this.cache.delete(key);
		this.cache.set(key, value);

		return value;
	}

	set(key: Key, value: Value): void {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.limit) {
			const lruKey = this.cache.keys().next().value as Key | undefined;
			if (lruKey !== undefined) this.cache.delete(lruKey);
		}

		this.cache.set(key, value);
	}

	clear(): void {
		this.cache.clear();
	}
}

export interface UsePDFToImageResult {
	getPageImage: (pageNum: number, scale?: number) => Promise<string | null>;
	isLoading: boolean;
	progress: number;
}

const usePDFToImage = (
	pdfUrl: string | null | undefined,
): UsePDFToImageResult => {
	const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [progress, setProgress] = useState<number>(0);
	const [pdfjsLib, setPdfjsLib] = useState<PDFJSStatic | null>(null);
	const renderCache = useMemo(
		() => ({
			images: new LRUCache<string, string>(12),
			pending: new Map<string, Promise<string | null>>(),
		}),
		[pdfDoc, pdfUrl],
	);

	useEffect(() => {
		if (!pdfUrl) return;
		let isCancelled = false;

		const configurePDFJS = (): void => {
			if (isCancelled || !window.pdfjsLib) return;

			window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
			setPdfjsLib(window.pdfjsLib);
		};

		if (window.pdfjsLib) {
			configurePDFJS();

			return () => {
				isCancelled = true;
			};
		}

		let script = document.getElementById(
			PDF_SCRIPT_ID,
		) as HTMLScriptElement | null;

		if (!script) {
			script = document.createElement("script");
			script.id = PDF_SCRIPT_ID;
			script.src = PDF_JS_URL;
			script.async = true;
			document.head.appendChild(script);
		}

		const handleLoad = (): void => configurePDFJS();
		const handleError = (): void => {
			if (!isCancelled) {
				setIsLoading(false);
				console.error(`Failed to load PDF.js from ${PDF_JS_URL}`);
			}
		};

		script.addEventListener("load", handleLoad);
		script.addEventListener("error", handleError);

		return () => {
			isCancelled = true;
			script?.removeEventListener("load", handleLoad);
			script?.removeEventListener("error", handleError);
		};
	}, [pdfUrl]);

	useEffect(() => {
		let isCancelled = false;
		let loadingTask: PDFLoadingTask | null = null;

		setPdfDoc(null);

		const loadPDF = async (): Promise<void> => {
			if (!pdfjsLib || !pdfUrl) {
				setIsLoading(false);
				setProgress(0);
				return;
			}

			setIsLoading(true);
			setProgress(0);

			try {
				loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
				loadingTask.onProgress = ({ loaded, total }: PDFProgressData): void => {
					if (!isCancelled && total && total > 0) {
						setProgress(Math.round((loaded / total) * 100));
					}
				};

				const pdf = await loadingTask.promise;

				if (!isCancelled) {
					setPdfDoc(pdf);
					setProgress(100);
				}
			} catch (error: unknown) {
				if (!isCancelled) {
					console.error("Error loading PDF:", error);
					setProgress(0);
				}
			} finally {
				if (!isCancelled) setIsLoading(false);
			}
		};

		void loadPDF();

		return () => {
			isCancelled = true;
			void loadingTask?.destroy?.();
		};
	}, [pdfUrl, pdfjsLib]);

	const getPageImage = useCallback(
		async (pageNum: number, scale = 2): Promise<string | null> => {
			if (!pdfDoc || isLoading || !pdfjsLib) return null;
			if (
				!Number.isInteger(pageNum) ||
				pageNum < 0 ||
				pageNum >= pdfDoc.numPages
			) {
				return null;
			}
			if (!Number.isFinite(scale) || scale <= 0) return null;

			const cacheKey = `${pageNum}@${scale}`;
			const cachedImage = renderCache.images.get(cacheKey);
			if (cachedImage !== undefined) return cachedImage;

			const pending = renderCache.pending.get(cacheKey);
			if (pending) return pending;
			const render = async (): Promise<string | null> => {
				try {
					// PDF.js page numbers are one-based; the app uses zero-based indexes.
					const page = await pdfDoc.getPage(pageNum + 1);
					const viewport = page.getViewport({ scale });
					const canvas = document.createElement("canvas");
					const context = canvas.getContext("2d", {
						willReadFrequently: true,
					});

					if (!context) return null;

					canvas.width = Math.ceil(viewport.width);
					canvas.height = Math.ceil(viewport.height);

					await page.render({
						canvasContext: context,
						viewport,
					}).promise;

					const dataUrl = canvas.toDataURL("image/webp");
					renderCache.images.set(cacheKey, dataUrl);

					return dataUrl;
				} catch (error: unknown) {
					console.error(`Failed to render PDF page ${pageNum}:`, error);
					return null;
				}
			};
			const task = render().finally(() => renderCache.pending.delete(cacheKey));
			renderCache.pending.set(cacheKey, task);
			return task;
		},
		[isLoading, pdfDoc, pdfjsLib, renderCache],
	);

	return { getPageImage, isLoading, progress };
};

export default usePDFToImage;
