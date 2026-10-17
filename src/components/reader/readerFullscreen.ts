export async function requestReaderFullscreen() {
	const surface = document.querySelector<HTMLElement>(
		"dialog[open] [data-reader-surface]",
	);
	if (!surface || !document.fullscreenEnabled || document.fullscreenElement)
		return;
	try {
		// Fullscreen the content inside the modal, never the library document.
		// Promoting the document above an open dialog hides the reader behind it.
		await surface.requestFullscreen();
	} catch {
		// Some mobile browsers only support the viewport-sized reader.
	}
}

export function exitReaderFullscreen(surface: HTMLElement | null) {
	if (surface && document.fullscreenElement === surface)
		void document.exitFullscreen().catch(() => {});
}
