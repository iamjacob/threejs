/** Own every stream, including one that resolves after cancellation/unmount. */
export function createCameraSession(request: () => Promise<MediaStream>) {
	let revision = 0;
	let stream: MediaStream | null = null;
	const stopTracks = (value: MediaStream) =>
		value.getTracks().forEach((track) => {
			track.stop();
		});
	const stop = () => {
		revision++;
		if (stream) stopTracks(stream);
		stream = null;
	};
	return {
		stop,
		async start() {
			stop();
			const current = revision;
			try {
				const result = await request();
				if (current !== revision) {
					stopTracks(result);
					return null;
				}
				stream = result;
				return stream;
			} catch (error) {
				if (current !== revision) return null;
				throw error;
			}
		},
	};
}

export function cameraError(error: unknown) {
	const name = error instanceof Error ? error.name : "";
	if (name === "NotAllowedError" || name === "SecurityError")
		return "Camera access wasn’t allowed. You can enable it in your browser’s site settings, or choose a photo.";
	if (name === "NotFoundError")
		return "No camera found. Choose a photo of your book instead.";
	if (name === "NotReadableError")
		return "The camera is busy. Close other apps using it and try again, or choose a photo.";
	return "The camera couldn’t start. Try again or choose a photo instead.";
}
