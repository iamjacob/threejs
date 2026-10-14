import { useEffect, useMemo, useRef, useState } from "react";
import { useShelfControlsStore } from "../../../stores/useShelfControlsStore";
import { bookImagePath } from "../../lib/bookImages";
import { createHelixNavigation, helixBooks } from "../../lib/helixNavigation";
import { publicAssetUrl } from "../../lib/publicAssetUrl";
import { useBookStore, useLibraryBooks } from "../../stores/useBookStore";
import { useTourStore } from "../../stores/useTourStore";
import { createHelixRenderer } from "./helixRenderer";
import "./helix-nav.css";

export default function HelixNav() {
	const library = useLibraryBooks();
	const order = useShelfControlsStore((state) => state.document.order);
	const hidden = useTourStore((state) => state.deletedBookIds);
	const selectedId = useBookStore((state) => state.selectedBookId);
	const pendingId = useTourStore((state) => state.pendingBookId);
	const navigate = useTourStore((state) => state.navigateBook);
	const books = useMemo(
		() => helixBooks(library, order, hidden),
		[library, order, hidden],
	);
	const selected = Math.max(
		0,
		books.findIndex((book) => book.id === (pendingId ?? selectedId)),
	);
	const current = useRef(selected);
	current.current = selected;
	const strip = useRef<HTMLDivElement>(null);
	const graphics = useRef<HTMLDivElement>(null);
	const controller = useRef<ReturnType<typeof createHelixNavigation> | null>(
		null,
	);
	const invalidate = useRef(() => {});
	const [fallback, setFallback] = useState(false);

	useEffect(() => {
		const element = strip.current;
		const host = graphics.current;
		if (!element || !host || !books.length || fallback) return;
		let frame = 0;
		let lastTime = 0;
		let wheelTimer: ReturnType<typeof setTimeout> | undefined;
		let disposed = false;
		const model = createHelixNavigation(
			books.length,
			current.current,
			(index) => navigate(books[index].id),
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		);
		controller.current = model;
		let renderer: ReturnType<typeof createHelixRenderer>;
		const draw = (now: number) => {
			frame = 0;
			if (disposed) return;
			const moving = model.tick(lastTime ? (now - lastTime) / 1000 : 1 / 60);
			lastTime = now;
			const { position, spacing } = model.state;
			renderer.draw(position, spacing);
			if (moving) requestDraw();
		};
		const requestDraw = () => {
			if (!disposed && !frame && !document.hidden) {
				if (performance.now() - lastTime > 100) lastTime = 0;
				frame = requestAnimationFrame(draw);
			}
		};
		invalidate.current = requestDraw;
		try {
			renderer = createHelixRenderer(host, books, requestDraw);
		} catch {
			controller.current = null;
			invalidate.current = () => {};
			setFallback(true);
			return;
		}
		const resize = new ResizeObserver(() => {
			renderer.resize();
			requestDraw();
		});
		resize.observe(host);
		renderer.resize();
		requestDraw();
		const pointers = new Map<number, number>();
		let pinching = false;
		let pinchDistance = 1;
		const clearWheel = () => {
			clearTimeout(wheelTimer);
			wheelTimer = undefined;
		};
		const cancel = () => {
			clearWheel();
			const captured = [...pointers.keys()];
			pointers.clear();
			for (const pointer of captured)
				if (element.hasPointerCapture(pointer))
					element.releasePointerCapture(pointer);
			pinching = false;
			model.cancel();
			requestDraw();
		};
		const down = (event: PointerEvent) => {
			if (event.button !== 0) return;
			event.preventDefault();
			element.focus({ preventScroll: true });
			clearWheel();
			element.setPointerCapture(event.pointerId);
			pointers.set(event.pointerId, event.clientX);
			if (pointers.size > 1) {
				pinching = true;
				model.cancel();
				const [a, b] = [...pointers.values()];
				pinchDistance = Math.max(1, Math.abs(a - b));
			} else model.begin(event.clientX, event.timeStamp);
		};
		const move = (event: PointerEvent) => {
			if (!pointers.has(event.pointerId)) return;
			pointers.set(event.pointerId, event.clientX);
			if (pointers.size === 2) {
				const [a, b] = [...pointers.values()];
				const distance = Math.max(1, Math.abs(a - b));
				model.zoom(distance / pinchDistance);
				pinchDistance = distance;
			} else if (!pinching) model.move(event.clientX, event.timeStamp);
			requestDraw();
		};
		const up = (event: PointerEvent) => {
			if (!pointers.has(event.pointerId)) return;
			pointers.delete(event.pointerId);
			if (!pinching) {
				const bounds = element.getBoundingClientRect();
				model.end(
					event.clientX - bounds.left - bounds.width / 2,
					event.timeStamp,
				);
			}
			if (!pointers.size) pinching = false;
			if (element.hasPointerCapture(event.pointerId))
				element.releasePointerCapture(event.pointerId);
			requestDraw();
		};
		const lost = (event: PointerEvent) => {
			if (pointers.has(event.pointerId)) cancel();
		};
		const wheel = (event: WheelEvent) => {
			event.preventDefault();
			if (pointers.size) return;
			clearWheel();
			if (event.ctrlKey || event.metaKey)
				model.zoom(Math.exp(-event.deltaY * 0.004));
			else {
				const units =
					event.deltaMode === 1
						? 16
						: event.deltaMode === 2
							? element.clientWidth
							: 1;
				model.scroll(
					(Math.abs(event.deltaX) > Math.abs(event.deltaY)
						? event.deltaX
						: event.deltaY) * units,
				);
				wheelTimer = setTimeout(() => {
					model.settle();
					requestDraw();
				}, 150);
			}
			requestDraw();
		};
		const keyboard = (event: KeyboardEvent) => {
			if (!model.key(event.key)) return;
			event.preventDefault();
			event.stopPropagation();
			clearWheel();
			requestDraw();
		};
		const visibility = () => {
			if (document.hidden) cancel();
			else requestDraw();
		};
		const contextLost = (event: Event) => {
			event.preventDefault();
			setFallback(true);
		};
		const canvas = host.querySelector("canvas");
		canvas?.addEventListener("webglcontextlost", contextLost);
		element.addEventListener("pointerdown", down);
		element.addEventListener("pointermove", move);
		element.addEventListener("pointerup", up);
		element.addEventListener("pointercancel", cancel);
		element.addEventListener("lostpointercapture", lost);
		element.addEventListener("wheel", wheel, { passive: false });
		element.addEventListener("keydown", keyboard);
		window.addEventListener("blur", cancel);
		document.addEventListener("visibilitychange", visibility);
		return () => {
			disposed = true;
			clearWheel();
			cancelAnimationFrame(frame);
			resize.disconnect();
			element.removeEventListener("pointerdown", down);
			element.removeEventListener("pointermove", move);
			element.removeEventListener("pointerup", up);
			element.removeEventListener("pointercancel", cancel);
			element.removeEventListener("lostpointercapture", lost);
			element.removeEventListener("wheel", wheel);
			element.removeEventListener("keydown", keyboard);
			window.removeEventListener("blur", cancel);
			document.removeEventListener("visibilitychange", visibility);
			canvas?.removeEventListener("webglcontextlost", contextLost);
			for (const pointer of pointers.keys())
				if (element.hasPointerCapture(pointer))
					element.releasePointerCapture(pointer);
			renderer.dispose();
			controller.current = null;
			invalidate.current = () => {};
		};
	}, [books, navigate, fallback]);
	useEffect(() => {
		controller.current?.sync(selected);
		invalidate.current();
	}, [selected]);
	if (!books.length) return null;
	return (
		<nav className="helix-nav" aria-label="My books" data-book-navigation>
			{fallback ? (
				<div className="helix-fallback" id="library-book-picker" tabIndex={-1}>
					{books.map((book) => (
						<button
							type="button"
							key={book.id}
							aria-label={`Select ${book.title}`}
							aria-pressed={book.id === selectedId}
							onClick={() => navigate(book.id)}
						>
							<img
								src={publicAssetUrl(bookImagePath(book.cover.front, "low"))}
								alt=""
							/>
						</button>
					))}
				</div>
			) : (
				<div
					ref={strip}
					id="library-book-picker"
					className="helix-strip"
					role="slider"
					tabIndex={0}
					aria-label="Choose a book"
					aria-orientation="horizontal"
					aria-valuemin={1}
					aria-valuemax={books.length}
					aria-valuenow={selected + 1}
					aria-valuetext={`${books[selected].title}, book ${selected + 1} of ${books.length}`}
					aria-describedby="helix-help"
				>
					<div ref={graphics} className="helix-graphics" aria-hidden="true" />
				</div>
			)}
			{/* <div className="helix-caption" aria-hidden="true">
				<span>My books</span>
				<span>
					{String(selected + 1).padStart(2, "0")}{" "}
					<span className="helix-count-divider">/</span>{" "}
					{String(books.length).padStart(2, "0")}
				</span>
			</div> */}
			<p className="sr-only" id="helix-help">
				Drag or scroll to choose a book. Use Left and Right arrow keys, Home or
				End. Press Enter to select the centered book. Pinch or use plus and
				minus to change spacing.
			</p>
		</nav>
	);
}
