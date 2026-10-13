import { useEffect } from "react";

import { useBookStore } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";
import { createShakeDetector } from "./shakeDetector";

export default function ShakeToRead() {
	useEffect(() => {
		if (!window.DeviceMotionEvent || !window.isSecureContext) return;
		let detect = createShakeDetector();
		let enabled = false;
		const update = () => {
			try {
				enabled =
					JSON.parse(localStorage.getItem("boooks-reader-settings") ?? "{}")
						.shake === true;
			} catch {
				enabled = false;
			}
			detect = createShakeDetector();
		};
		update();
		const motion = (event: DeviceMotionEvent) => {
			const tour = useTourStore.getState();
			if (
				!enabled ||
				document.hidden ||
				tour.reader !== "closed" ||
				document.querySelector("dialog[open]")
			) {
				detect = createShakeDetector();
				return;
			}
			if (
				!detect(
					event.accelerationIncludingGravity ?? event.acceleration,
					performance.now(),
				)
			)
				return;
			try {
				const last = JSON.parse(
					localStorage.getItem("boooks-last-reader") ?? "null",
				);
				if (
					!useBookStore
						.getState()
						.books.some((book) => book.id === last?.bookId)
				)
					return;
				useBookStore.getState().selectBook(last.bookId);
				tour.enter("read");
				// A shake has no browser user activation; resume in the full viewport.
				useTourStore.setState({ reader: "open", paused: true });
			} catch {
				/* No saved book yet, or browser storage is disabled. */
			}
		};
		const storage = (event: StorageEvent) => {
			if (event.key === "boooks-reader-settings") update();
		};
		window.addEventListener("storage", storage);
		window.addEventListener("devicemotion", motion);
		return () => {
			window.removeEventListener("storage", storage);
			window.removeEventListener("devicemotion", motion);
		};
	}, []);
	return null;
}
