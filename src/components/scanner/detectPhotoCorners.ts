import type { Point } from "./perspective";

// Only a small copy is sent to the worker; the full-resolution photo still feeds
// the existing cropper. Terminating on abort prevents stale detections and work.
export function detectPhotoCorners(
	source: HTMLCanvasElement,
	signal: AbortSignal,
): Promise<Point[] | null> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			resolve(null);
			return;
		}
		const sample = document.createElement("canvas");
		const scale = Math.min(1, 512 / Math.max(source.width, source.height));
		sample.width = Math.max(1, Math.round(source.width * scale));
		sample.height = Math.max(1, Math.round(source.height * scale));
		const context = sample.getContext("2d", { willReadFrequently: true });
		if (!context) {
			resolve(null);
			return;
		}
		context.drawImage(source, 0, 0, sample.width, sample.height);
		const pixels = context.getImageData(0, 0, sample.width, sample.height);
		const worker = new Worker(
			new URL("./cornerDetector.worker.ts", import.meta.url),
			{ type: "module" },
		);
		const finish = (points: Point[] | null) => {
			cleanup();
			resolve(
				points?.map((p) => ({
					x: (p.x * source.width) / sample.width,
					y: (p.y * source.height) / sample.height,
				})) ?? null,
			);
		};
		const abort = () => finish(null);
		const timeout = window.setTimeout(() => finish(null), 8000);
		const cleanup = () => {
			window.clearTimeout(timeout);
			signal.removeEventListener("abort", abort);
			worker.terminate();
		};
		signal.addEventListener("abort", abort, { once: true });
		worker.onmessage = (event: MessageEvent<Point[] | null>) =>
			finish(event.data);
		worker.onerror = (event) => {
			event.preventDefault();
			cleanup();
			reject(new Error("Corner detection unavailable."));
		};
		worker.onmessageerror = () => finish(null);
		try {
			worker.postMessage(pixels, [pixels.data.buffer]);
		} catch (error) {
			cleanup();
			reject(error);
		}
	});
}
