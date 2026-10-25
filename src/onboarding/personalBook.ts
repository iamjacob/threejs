import { LANDING_STATIONS } from "./selection.ts";

export type PersonalBook = {
	title: string;
	author: string;
	coverDataUrl: string;
	/** Journey progress of the shelf this cover flies onto. */
	landAt: number;
};

/**
 * A maps search for libraries. Opened only from the "Find a library near me"
 * tap. The URL does not carry coordinates, so the page does not ask for
 * location before that tap — and this tap itself does not call geolocation.
 */
export function librarySearchUrl() {
	return "https://www.google.com/maps/search/?api=1&query=library";
}

export function shelfWelcome(title: string) {
	const name = title.trim();
	if (!name) return "Your first shelf is waiting.";
	return `${name} is already on your shelf.`;
}

/** The next shelf ahead of the camera. The personal cover lands there, first. */
export function personalLandingT(progress: number) {
	const ahead = LANDING_STATIONS.find((station) => station.t > progress + 0.02);
	return (ahead ?? LANDING_STATIONS[LANDING_STATIONS.length - 1]).t;
}

/** A cover plate for a typed title, so the flight still has a face to carry. */
export function renderTitleCover(title: string, author = "") {
	if (typeof document === "undefined") return "";
	const canvas = document.createElement("canvas");
	canvas.width = 512;
	canvas.height = 768;
	const context = canvas.getContext("2d");
	if (!context) return "";
	context.fillStyle = "#6e2430";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.fillStyle = "#f4efe6";
	context.fillRect(40, 48, 432, 8);
	context.font = "600 52px Georgia, serif";
	const words = title.trim().split(/\s+/).filter(Boolean);
	let line = "";
	let y = 300;
	for (const word of words) {
		const next = line ? `${line} ${word}` : word;
		if (context.measureText(next).width > 400 && line) {
			context.fillText(line, 48, y);
			line = word;
			y += 66;
		} else {
			line = next;
		}
	}
	if (line) context.fillText(line, 48, y);
	const by = author.trim();
	if (by) {
		context.font = "400 28px Georgia, serif";
		context.fillText(by, 48, Math.min(y + 84, 680));
	}
	return canvas.toDataURL("image/jpeg", 0.86);
}

export function captureVideoFrame(video: HTMLVideoElement) {
	const canvas = document.createElement("canvas");
	const width = video.videoWidth || 640;
	const height = video.videoHeight || 480;
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) return "";
	context.drawImage(video, 0, 0, width, height);
	return canvas.toDataURL("image/jpeg", 0.86);
}

type Listener = () => void;

let book: PersonalBook | null = null;
const listeners = new Set<Listener>();

export function getPersonalBook() {
	return book;
}

export function subscribePersonalBook(listener: Listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function emit() {
	for (const listener of listeners) listener();
}

export function setPersonalBook(next: PersonalBook | null) {
	book = next;
	emit();
}

export function resetPersonalBook() {
	book = null;
	emit();
}
