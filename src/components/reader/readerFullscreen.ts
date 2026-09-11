export function requestReaderFullscreen() {
	if (!document.fullscreenEnabled || document.fullscreenElement) return;
	void document.documentElement
		.requestFullscreen()
		.then(() => {
			document.documentElement.dataset.readerFullscreen = "true";
		})
		.catch(() => {
			// Some mobile browsers only support the viewport-sized reader.
		});
}

export function exitReaderFullscreen() {
	if (!document.documentElement.dataset.readerFullscreen) return;
	delete document.documentElement.dataset.readerFullscreen;
	if (document.fullscreenElement)
		void document.exitFullscreen().catch(() => {});
}
